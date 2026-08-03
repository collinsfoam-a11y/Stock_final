"""
User Model
"""

from typing import Any

from bson import ObjectId
from pydantic import BaseModel, ConfigDict, EmailStr, Field, GetJsonSchemaHandler
from pydantic.json_schema import JsonSchemaValue
from pydantic_core import core_schema


class PyObjectId(ObjectId):
    @classmethod
    def __get_pydantic_core_schema__(
        cls, _source_type: Any, _handler: Any
    ) -> core_schema.CoreSchema:
        return core_schema.json_or_python_schema(
            json_schema=core_schema.str_schema(),
            python_schema=core_schema.union_schema(
                [
                    core_schema.is_instance_schema(ObjectId),
                    core_schema.no_info_plain_validator_function(cls.validate),
                ]
            ),
            serialization=core_schema.plain_serializer_function_ser_schema(lambda x: str(x)),
        )

    @classmethod
    def validate(cls, v):
        if not ObjectId.is_valid(v):
            raise ValueError("Invalid ObjectId")
        return ObjectId(v)

    @classmethod
    def __get_pydantic_json_schema__(
        cls,
        _core_schema: core_schema.CoreSchema,
        handler: GetJsonSchemaHandler,
    ) -> JsonSchemaValue:
        return handler(core_schema.str_schema())


class UserBase(BaseModel):
    username: str
    email: EmailStr | None = None
    full_name: str | None = None
    phone_number: str | None = Field(None, pattern=r"^\+?[1-9]\d{1,14}$")
    role: str = "staff"
    is_active: bool = True


class UserCreate(UserBase):
    password: str
    pin: str | None = None  # 4-6 digit PIN


class UserUpdate(BaseModel):
    email: EmailStr | None = None
    full_name: str | None = None
    phone_number: str | None = Field(None, pattern=r"^\+?[1-9]\d{1,14}$")
    password: str | None = None
    pin: str | None = None
    is_active: bool | None = None
    role: str | None = None


class UserInDB(UserBase):
    id: PyObjectId | None = Field(default_factory=PyObjectId, alias="_id")
    hashed_password: str
    pin_hash: str | None = None

    model_config = ConfigDict(
        populate_by_name=True,
        arbitrary_types_allowed=True,
    )


class User(UserInDB):
    pass


class UserResponse(UserBase):
    id: str = Field(..., alias="_id")

    model_config = ConfigDict(
        populate_by_name=True,
    )
