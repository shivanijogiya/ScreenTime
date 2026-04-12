from datetime import datetime
from typing import Literal
from pydantic import BaseModel, Field


class DeviceRegisterRequest(BaseModel):
    name: str = Field(..., examples=["Shivani's Phone"])
    type: Literal["phone", "tablet", "laptop"]
    priority: int = Field(default=5, ge=1, le=10)


class DeviceOut(BaseModel):
    id: str
    user_id: str
    name: str
    type: str
    priority: int
    is_online: bool
    last_heartbeat: datetime | None
    registered_at: datetime

    model_config = {"from_attributes": True}


class HeartbeatRequest(BaseModel):
    battery: int | None = Field(default=None, ge=0, le=100)


class HeartbeatResponse(BaseModel):
    device_id: str
    is_online: bool
    timestamp: datetime