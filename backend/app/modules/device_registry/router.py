from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.modules.auth_service.models import User
from app.modules.auth_service.oauth import get_current_user
from app.modules.device_registry import service
from app.modules.device_registry.schemas import (
    DeviceOut,
    DeviceRegisterRequest,
    HeartbeatRequest,
    HeartbeatResponse,
)
from datetime import datetime, timezone

router = APIRouter(tags=["Device Registry"])

CurrentUser = Annotated[User, Depends(get_current_user)]
DB = Annotated[AsyncSession, Depends(get_db)]


@router.post("/register", response_model=DeviceOut, status_code=201)
async def register(body: DeviceRegisterRequest, user: CurrentUser, db: DB):
    return await service.register_device(
        user=user,
        name=body.name,
        device_type=body.type,
        priority=body.priority,
        db=db,
    )


@router.post("/{device_id}/heartbeat", response_model=HeartbeatResponse)
async def heartbeat(
    device_id: str,
    body: HeartbeatRequest,
    user: CurrentUser,
    db: DB,
):
    device = await service.heartbeat(device_id, user, body.battery, db)
    return HeartbeatResponse(
        device_id=device.id,
        is_online=device.is_online,
        timestamp=datetime.now(timezone.utc),
    )


@router.get("/", response_model=list[DeviceOut])
async def list_devices(user: CurrentUser, db: DB):
    return await service.list_devices(user, db)


@router.delete("/{device_id}", status_code=204)
async def deregister(device_id: str, user: CurrentUser, db: DB):
    await service.deregister_device(device_id, user, db)
