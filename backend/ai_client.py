from __future__ import annotations

import json
from typing import Any, AsyncGenerator
import httpx

class TextDelta:
    def __init__(self, content: str = "") -> None:
        self.content = content

class StreamDone:
    pass

class UserMessage:
    def __init__(self, text: str = "", image_contents: list[Any] | None = None) -> None:
        self.text = text
        self.image_contents = image_contents or []

class ImageContent:
    def __init__(self, image_base64: str = "") -> None:
        self.image_base64 = image_base64

class DirectAiClient:
    def __init__(
        self,
        api_key: str,
        provider: str,
        model: str,
        system_message: str = "",
    ) -> None:
        self.api_key = api_key
        self.provider = provider
        self.model = model
        self.system_message = system_message

    async def stream_message(
        self, message: UserMessage
    ) -> AsyncGenerator[TextDelta | StreamDone, None]:
        if self.provider == "gemini":
            async for chunk in self._stream_gemini(message):
                yield chunk
        elif self.provider == "anthropic":
            async for chunk in self._stream_anthropic(message):
                yield chunk
        elif self.provider == "openai":
            async for chunk in self._stream_openai(message):
                yield chunk
        else:
            # Fallback mock/error
            yield TextDelta(content=f"Unsupported provider: {self.provider}")
            yield StreamDone()

    async def _stream_gemini(
        self, message: UserMessage
    ) -> AsyncGenerator[TextDelta | StreamDone, None]:
        key = self.api_key or ""
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:streamGenerateContent"
        
        parts = []
        if message.text:
            parts.append({"text": message.text})
        
        for img in message.image_contents:
            parts.append({
                "inlineData": {
                    "mimeType": "image/jpeg",
                    "data": img.image_base64
                }
            })

        payload = {
            "contents": [{"parts": parts}]
        }
        if self.system_message:
            payload["systemInstruction"] = {
                "parts": [{"text": self.system_message}]
            }

        headers = {}
        if key:
            headers["x-goog-api-key"] = key

        async with httpx.AsyncClient(timeout=60.0) as client:
            try:
                async with client.stream("POST", url, headers=headers, json=payload) as response:
                    if response.status_code != 200:
                        err_body = await response.aread()
                        yield TextDelta(content=f"Gemini API Error: {response.status_code} - {err_body.decode('utf-8')}")
                        yield StreamDone()
                        return
                    
                    async for line in response.aiter_lines():
                        if not line:
                            continue
                        # Gemini returns SSE or a JSON array chunk depending on connection headers,
                        # usually a streaming JSON array of chunks. We parse line-by-line.
                        clean_line = line.strip().lstrip(",").lstrip("[").rstrip("]")
                        if not clean_line:
                            continue
                        try:
                            data = json.loads(clean_line)
                            parts_res = data.get("candidates", [{}])[0].get("content", {}).get("parts", [])
                            for p in parts_res:
                                if "text" in p:
                                    yield TextDelta(content=p["text"])
                        except Exception:
                            continue
            except Exception as e:
                yield TextDelta(content=f"Request failed: {e}")
        yield StreamDone()

    async def _stream_anthropic(
        self, message: UserMessage
    ) -> AsyncGenerator[TextDelta | StreamDone, None]:
        url = "https://api.anthropic.com/v1/messages"
        headers = {
            "x-api-key": self.api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        }
        
        content_parts = []
        if message.text:
            content_parts.append({"type": "text", "text": message.text})
            
        for img in message.image_contents:
            content_parts.append({
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": "image/jpeg",
                    "data": img.image_base64
                }
            })

        payload = {
            "model": self.model,
            "messages": [{"role": "user", "content": content_parts}],
            "max_tokens": 4000,
            "stream": True,
        }
        if self.system_message:
            payload["system"] = self.system_message

        async with httpx.AsyncClient(timeout=60.0) as client:
            try:
                async with client.stream("POST", url, headers=headers, json=payload) as response:
                    if response.status_code != 200:
                        err_body = await response.aread()
                        yield TextDelta(content=f"Anthropic API Error: {response.status_code} - {err_body.decode('utf-8')}")
                        yield StreamDone()
                        return
                    
                    async for line in response.aiter_lines():
                        if line.startswith("data:"):
                            data_str = line[5:].strip()
                            if data_str == "[DONE]":
                                break
                            try:
                                event = json.loads(data_str)
                                ev_type = event.get("type")
                                if ev_type == "content_block_delta":
                                    delta = event.get("delta", {})
                                    if delta.get("type") == "text_delta":
                                        yield TextDelta(content=delta.get("text", ""))
                            except Exception:
                                continue
            except Exception as e:
                yield TextDelta(content=f"Request failed: {e}")
        yield StreamDone()

    async def _stream_openai(
        self, message: UserMessage
    ) -> AsyncGenerator[TextDelta | StreamDone, None]:
        url = "https://api.openai.com/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        messages = []
        if self.system_message:
            messages.append({"role": "system", "content": self.system_message})
        text = message.text or ""
        messages.append({"role": "user", "content": text})

        payload = {
            "model": self.model,
            "messages": messages,
            "stream": True,
            "max_tokens": 4096,
        }

        async with httpx.AsyncClient(timeout=60.0) as client:
            try:
                async with client.stream("POST", url, headers=headers, json=payload) as response:
                    if response.status_code != 200:
                        err_body = await response.aread()
                        yield TextDelta(content=f"OpenAI API Error: {response.status_code} - {err_body.decode('utf-8')}")
                        yield StreamDone()
                        return

                    async for line in response.aiter_lines():
                        if line.startswith("data: "):
                            data_str = line[6:].strip()
                            if data_str == "[DONE]":
                                break
                            try:
                                event = json.loads(data_str)
                                choice = event.get("choices", [{}])[0]
                                delta = choice.get("delta", {})
                                if delta.get("content"):
                                    yield TextDelta(content=delta["content"])
                            except Exception:
                                continue
            except Exception as e:
                yield TextDelta(content=f"Request failed: {e}")
        yield StreamDone()
