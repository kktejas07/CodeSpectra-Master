from __future__ import annotations

import json
from typing import Any, AsyncGenerator
import httpx

class TextDelta:
    def __init__(self, content: str = "") -> None:
        self.content = content

class StreamDone:
    def __init__(self, usage: dict | None = None) -> None:
        self.usage = usage or {}

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
        api_key: str | list[str],
        provider: str,
        model: str,
        system_message: str = "",
        base_url: str = "",
        fallback_providers: list[tuple[str, str, str, str]] | None = None,
    ) -> None:
        self.keys = [api_key] if isinstance(api_key, str) else api_key
        self.current_key_index = 0
        self.provider = provider
        self.model = model
        self.system_message = system_message
        self.base_url = base_url
        self.fallback_providers = fallback_providers or []
        self.fallback_index = 0

    @property
    def api_key(self) -> str:
        if self.current_key_index < len(self.keys):
            return self.keys[self.current_key_index].strip()
        return ""

    def _next_key(self) -> bool:
        self.current_key_index += 1
        return self.current_key_index < len(self.keys) and bool(self.keys[self.current_key_index].strip())

    def _try_fallback(self) -> bool:
        if self.fallback_index < len(self.fallback_providers):
            fallback = self.fallback_providers[self.fallback_index]
            self.fallback_index += 1
            self.provider = fallback[0]
            self.model = fallback[1]
            self.keys = [fallback[2]]
            self.current_key_index = 0
            self.base_url = fallback[3]
            return True
        return False

    async def stream_message(
        self, message: UserMessage
    ) -> AsyncGenerator[TextDelta | StreamDone, None]:
        input_chars = len(self.system_message or "") + len(message.text or "")
        
        while True:
            output_chars = 0
            had_error = False
            
            if self.provider == "gemini":
                async for chunk in self._stream_gemini(message):
                    if isinstance(chunk, TextDelta) and "Error" in chunk.content:
                        had_error = True
                        if self._next_key():
                            break  # retry with next key
                        elif self._try_fallback():
                            break  # retry with fallback provider
                    elif isinstance(chunk, StreamDone):
                        chunk.usage["input_chars"] = input_chars
                        chunk.usage["output_chars"] = output_chars
                    if isinstance(chunk, TextDelta):
                        output_chars += len(chunk.content)
                    yield chunk
            elif self.provider == "anthropic":
                async for chunk in self._stream_anthropic(message):
                    if isinstance(chunk, TextDelta) and "Error" in chunk.content:
                        had_error = True
                        if self._next_key():
                            break
                        elif self._try_fallback():
                            break
                    elif isinstance(chunk, StreamDone):
                        chunk.usage["input_chars"] = input_chars
                        chunk.usage["output_chars"] = output_chars
                    if isinstance(chunk, TextDelta):
                        output_chars += len(chunk.content)
                    yield chunk
            else:
                async for chunk in self._stream_openai(message):
                    if isinstance(chunk, TextDelta) and "API Error" in chunk.content:
                        had_error = True
                        if self._next_key():
                            break
                        elif self._try_fallback():
                            break
                    elif isinstance(chunk, StreamDone):
                        chunk.usage["input_chars"] = input_chars
                        chunk.usage["output_chars"] = output_chars
                    if isinstance(chunk, TextDelta):
                        output_chars += len(chunk.content)
                    yield chunk
            
            if not had_error:
                break

    async def _stream_gemini(
        self, message: UserMessage
    ) -> AsyncGenerator[TextDelta | StreamDone, None]:
        base = self.base_url.strip().rstrip("/") if self.base_url else "https://generativelanguage.googleapis.com/v1beta"
        key = self.api_key or ""
        url = f"{base}/models/{self.model}:streamGenerateContent?key={key}"
        
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
        base = self.base_url.strip().rstrip("/") if self.base_url else "https://api.openai.com/v1"
        url = f"{base}/chat/completions"
        headers = {
            "Content-Type": "application/json",
        }
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
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
                        err_text = err_body.decode("utf-8", errors="replace")[:500]
                        if response.status_code == 401 and (
                            "No cookie auth credentials found" in err_text
                            or "Missing Authentication header" in err_text
                            or "User not found" in err_text
                            or "Invalid API key" in err_text
                            or "Incorrect API key" in err_text
                            or "Unauthorized" in err_text
                            or self.provider in ("opencode", "openrouter", "omnirouter")
                        ):
                            if self.provider == "openrouter" or self.provider == "omnirouter":
                                yield TextDelta(content=f"API Error (401): Missing or invalid API key for {self.provider.upper()}. Note: OpenRouter API keys MUST start with 'sk-or-v1-'. Please go to Settings → AI & LLM Provider, get a free key at https://openrouter.ai/keys, and enter it.")
                            elif self.provider == "opencode":
                                yield TextDelta(content=f"API Error (401): Missing or invalid API key for OPENCODE. Please check your clean unmasked API key at https://opencode.ai/workspace/keys and enter it in Settings → AI & LLM Provider.")
                            else:
                                yield TextDelta(content=f"API Error (401): Missing or invalid API key for {self.provider.upper()}. Please verify your API key in Settings → AI & LLM Provider.")
                        else:
                            yield TextDelta(content=f"API Error ({response.status_code}): {err_text}")
                        yield StreamDone()
                        return

                    async for line in response.aiter_lines():
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
