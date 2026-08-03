"""Domain Plugin Registry for Code Spectra Multi-Domain Engine."""
import importlib.metadata
import logging
from typing import Dict, List
from backend.core.contracts.domain import DomainManifest, DomainPlugin

logger = logging.getLogger(__name__)


class UnknownDomain(KeyError):
    """Raised when an requested domain key is not registered."""
    pass


_PLUGINS: Dict[str, DomainPlugin] = {}


def register(plugin: DomainPlugin) -> None:
    """Register a DomainPlugin instance."""
    key = plugin.manifest.key
    if key in _PLUGINS:
        raise ValueError(f"duplicate domain key: {key}")
    _PLUGINS[key] = plugin
    logger.info(f"Registered domain plugin: {key} (v{plugin.manifest.version})")


def get(key: str) -> DomainPlugin:
    """Retrieve a registered domain plugin by key."""
    if key not in _PLUGINS:
        load_entry_point_plugins()
    try:
        return _PLUGINS[key]
    except KeyError:
        raise UnknownDomain(key)


def all_manifests() -> List[DomainManifest]:
    """List manifests of all registered domain plugins."""
    load_entry_point_plugins()
    return [p.manifest for p in _PLUGINS.values()]


def clear_registry() -> None:
    """Clear registered plugins (used during test teardown)."""
    _PLUGINS.clear()


def load_entry_point_plugins() -> None:
    """Discover and register domain plugins dynamically via entry points ('codespectra.domains') and built-ins."""
    # Register built-in core plugins if not already present
    try:
        from backend.domains.code_exec import plugin as code_exec_plugin
        if code_exec_plugin.manifest.key not in _PLUGINS:
            register(code_exec_plugin)
        from backend.domains.sql import plugin as sql_plugin
        if sql_plugin.manifest.key not in _PLUGINS:
            register(sql_plugin)
        from backend.domains.cad_step import plugin as cad_step_plugin
        if cad_step_plugin.manifest.key not in _PLUGINS:
            register(cad_step_plugin)

        # CS-ITEMBANK-v1.0 Generic Plugins
        from backend.domains.mcq import plugin as mcq_plugin
        if mcq_plugin.manifest.key not in _PLUGINS:
            register(mcq_plugin)
        from backend.domains.multi_select import plugin as multi_select_plugin
        if multi_select_plugin.manifest.key not in _PLUGINS:
            register(multi_select_plugin)
        from backend.domains.numeric_response import plugin as numeric_response_plugin
        if numeric_response_plugin.manifest.key not in _PLUGINS:
            register(numeric_response_plugin)
        from backend.domains.matching import plugin as matching_plugin
        if matching_plugin.manifest.key not in _PLUGINS:
            register(matching_plugin)
        from backend.domains.hotspot import plugin as hotspot_plugin
        if hotspot_plugin.manifest.key not in _PLUGINS:
            register(hotspot_plugin)
        from backend.domains.ordering import plugin as ordering_plugin
        if ordering_plugin.manifest.key not in _PLUGINS:
            register(ordering_plugin)
        from backend.domains.table_fill import plugin as table_fill_plugin
        if table_fill_plugin.manifest.key not in _PLUGINS:
            register(table_fill_plugin)
        from backend.domains.rich_text import plugin as rich_text_plugin
        if rich_text_plugin.manifest.key not in _PLUGINS:
            register(rich_text_plugin)
        from backend.domains.video_response import plugin as video_response_plugin
        if video_response_plugin.manifest.key not in _PLUGINS:
            register(video_response_plugin)
    except Exception as err:
        logger.debug(f"Built-in plugin load fallback: {err}")

    try:
        eps = importlib.metadata.entry_points()
        domain_eps = eps.select(group="codespectra.domains") if hasattr(eps, "select") else eps.get("codespectra.domains", [])
        for ep in domain_eps:
            plugin_obj = ep.load()
            if hasattr(plugin_obj, "manifest") and plugin_obj.manifest.key not in _PLUGINS:
                register(plugin_obj)
    except Exception as exc:
        logger.debug(f"Entry point discovery pass completed: {exc}")
