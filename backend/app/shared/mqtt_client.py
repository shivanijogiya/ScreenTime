import json
import logging
from typing import Any
import paho.mqtt.client as mqtt
from app.config import settings

logger = logging.getLogger(__name__)

_client: mqtt.Client | None = None


def _build_client() -> mqtt.Client:
    if not settings.MQTT_ENABLED:
        raise RuntimeError("MQTT is disabled by configuration")
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION1, client_id=settings.MQTT_CLIENT_ID + "-pub")
    client.username_pw_set(settings.MQTT_USERNAME, settings.MQTT_PASSWORD)

    def on_connect(c, userdata, flags, rc):
        if rc == 0:
            logger.info("MQTT publisher connected")
        else:
            logger.error(f"MQTT publisher connect failed rc={rc}")

    client.on_connect = on_connect
    client.connect(settings.MQTT_BROKER_HOST, settings.MQTT_BROKER_PORT, keepalive=60)
    client.loop_start()
    return client


class MQTTClientWrapper:
    def __init__(self):
        self._wrapped = None

    def connect(self, host, port, username, password):
        self._wrapped = _build_client()
        # _build_client handles connecting

    def disconnect(self):
        if self._wrapped:
            self._wrapped.disconnect()

    def is_connected(self):
        if self._wrapped:
            return self._wrapped.is_connected()
        return False
        
    def publish(self, topic, payload, qos=1):
        if self._wrapped:
            self._wrapped.publish(topic, payload, qos=qos)

mqtt_client = MQTTClientWrapper()

def get_mqtt_client() -> mqtt.Client:
    global _client
    if _client is None:
        _client = _build_client()
    return _client


def publish(topic: str, payload: dict[str, Any], qos: int = 1) -> None:
    """Publish a JSON payload to an MQTT topic."""
    try:
        client = get_mqtt_client()
    except Exception as exc:
        logger.warning("Skipping MQTT publish for %s: %s", topic, exc)
        return
    client.publish(topic, json.dumps(payload), qos=qos)
    logger.debug(f"MQTT → {topic}: {payload}")


# ── Topic helpers ──────────────────────────────────────────────────────────────

def topic_budget(user_id: str, device_id: str) -> str:
    return f"screensync/{user_id}/{device_id}/budget/receive"


def topic_enforce(user_id: str, device_id: str) -> str:
    return f"screensync/{user_id}/{device_id}/control/enforce"


def topic_override_result(user_id: str, device_id: str) -> str:
    return f"screensync/{user_id}/{device_id}/override/result"


def topic_family_override(user_id: str) -> str:
    return f"screensync/{user_id}/family/override/request"
