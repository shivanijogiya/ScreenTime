"""
MQTT Listener — runs in a background thread.
Subscribes to all usage/report topics and persists events to DB via a sync session.
"""
import json
import logging
import threading
from datetime import datetime, timezone

import paho.mqtt.client as mqtt
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.config import settings
from app.modules.usage_ingestion.models import UsageEvent
from app.modules.device_registry.models import Device
from app.modules.decision_engine.engine import evaluate_and_enforce

logger = logging.getLogger(__name__)

# Sync engine for the MQTT listener thread (asyncpg doesn't work in threads)
_engine_kwargs = {}
if not settings.DATABASE_URL.startswith("sqlite:///"):
    _engine_kwargs["pool_size"] = 5

_sync_engine = create_engine(settings.DATABASE_URL, **_engine_kwargs)
_SyncSession = sessionmaker(bind=_sync_engine)

TOPIC_USAGE = "screensync/+/+/usage/report"
TOPIC_HEARTBEAT = "screensync/+/+/heartbeat"


def _on_connect(client, userdata, flags, rc):
    if rc == 0:
        client.subscribe(TOPIC_USAGE, qos=1)
        client.subscribe(TOPIC_HEARTBEAT, qos=1)
        logger.info("MQTT listener subscribed to usage + heartbeat topics")
    else:
        logger.error(f"MQTT listener connect failed rc={rc}")


def _on_message(client, userdata, msg: mqtt.MQTTMessage):
    try:
        parts = msg.topic.split("/")
        # screensync / {user_id} / {device_id} / usage / report
        if len(parts) < 5:
            return

        user_id = parts[1]
        device_id = parts[2]
        event_type = parts[3]

        payload = json.loads(msg.payload.decode())

        if event_type == "usage":
            _handle_usage(user_id, device_id, payload)
        elif event_type == "heartbeat":
            _handle_heartbeat(device_id, payload)

    except Exception as exc:
        logger.exception(f"MQTT message processing error: {exc}")


def _handle_usage(user_id: str, device_id: str, payload: dict):
    category = payload.get("category", "other")
    duration = int(payload.get("secs", 0))

    if duration <= 0:
        return

    with _SyncSession() as session:
        # Verify device exists
        device = session.get(Device, device_id)
        if not device or device.user_id != user_id:
            logger.warning(f"Unknown device {device_id} or user mismatch")
            return

        event = UsageEvent(
            device_id=device_id,
            app_category=category,
            duration_seconds=duration,
        )
        session.add(event)
        session.commit()
        logger.debug(f"Recorded {duration}s of {category} for device {device_id}")

        # Trigger decision engine after each usage event
        evaluate_and_enforce(user_id=user_id, device_id=device_id, session=session)


def _handle_heartbeat(device_id: str, payload: dict):
    with _SyncSession() as session:
        device = session.get(Device, device_id)
        if device:
            device.is_online = True
            device.last_heartbeat = datetime.now(timezone.utc)
            session.commit()


def start_mqtt_listener():
    """Start MQTT listener in a daemon thread. Call from app lifespan."""
    if not settings.MQTT_ENABLED:
        logger.info("MQTT listener disabled by configuration")
        return

    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION1, client_id=settings.MQTT_CLIENT_ID + "-listener")
    client.username_pw_set(settings.MQTT_USERNAME, settings.MQTT_PASSWORD)
    client.on_connect = _on_connect
    client.on_message = _on_message
    try:
        client.connect(settings.MQTT_BROKER_HOST, settings.MQTT_BROKER_PORT, keepalive=60)
    except Exception as exc:
        logger.warning("MQTT listener not started: %s", exc)
        return

    thread = threading.Thread(target=client.loop_forever, daemon=True)
    thread.start()
    logger.info("MQTT listener thread started")
