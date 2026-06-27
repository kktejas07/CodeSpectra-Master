from __future__ import annotations

from typing import Any, AsyncGenerator


class LlmChat:
    def __init__(
        self,
        *,
        api_key: str = "",
        session_id: str = "",
        system_message: str = "",
    ) -> None:
        self.api_key = api_key
        self.session_id = session_id
        self.system_message = system_message
        self._provider: str | None = None
        self._model: str | None = None

    def with_model(self, provider: str, model: str) -> LlmChat:
        self._provider = provider
        self._model = model
        return self

    async def stream_message(
        self, message: UserMessage
    ) -> AsyncGenerator[TextDelta | StreamDone, None]:
        yield TextDelta(content="")
        yield StreamDone()


class UserMessage:
    def __init__(
        self,
        text: str = "",
        image_contents: list[Any] | None = None,
    ) -> None:
        self.text = text
        self.image_contents = image_contents or []


class TextDelta:
    def __init__(self, content: str = "") -> None:
        self.content = content


class StreamDone:
    def __init__(self) -> None:
        pass


class ImageContent:
    def __init__(self, image_base64: str = "") -> None:
        self.image_base64 = image_base64
