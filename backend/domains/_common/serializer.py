"""Candidate payload serializer enforcing answer_keys stripping guardrail."""
from typing import Any, Dict, List, Type
from pydantic import BaseModel


class MissingAnswerKeysGuardrailError(ValueError):
    """Raised when an item payload class omits mandatory answer_keys attribute."""
    pass


def sanitize_workspace_descriptor(
    payload_model: BaseModel,
) -> Dict[str, Any]:
    """Serialize item payload to dictionary and strip all declared answer_keys."""
    cls: Type[BaseModel] = payload_model.__class__
    answer_keys: List[str] = getattr(cls, "answer_keys", None)

    if answer_keys is None:
        raise MissingAnswerKeysGuardrailError(
            f"Guardrail violation: Payload class '{cls.__name__}' MUST define 'answer_keys: ClassVar[list[str]]'"
        )

    data = payload_model.model_dump()
    for key in answer_keys:
        data.pop(key, None)

    return data
