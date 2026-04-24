"""LLM configuration endpoints."""

import json
from pathlib import Path
from urllib import error as urllib_error
from urllib import request as urllib_request

from fastapi import APIRouter, HTTPException

from app.config import settings
from app.llm import (
    AI_ROUTE_CLIPROXY,
    AI_ROUTE_DIRECT,
    check_llm_health,
    CLIPROXY_PROVIDER_FILTERS,
    LLM_HEALTH_CHECK_PROMPT,
    LLMConfig,
    normalize_ai_route,
    normalize_cliproxy_api_base,
    resolve_api_key,
)
from app.schemas import (
    LLMConfigRequest,
    LLMConfigResponse,
    CLIProxyConfigResponse,
    CLIProxyModelsRequest,
    CLIProxyModelsResponse,
    CLIProxyModelOption,
    CLIProxyQuickProfile,
    CritiqueConfigRequest,
    CritiqueConfigResponse,
    FeatureConfigRequest,
    FeatureConfigResponse,
    GenerationDefaultsRequest,
    GenerationDefaultsResponse,
    LanguageConfigRequest,
    LanguageConfigResponse,
    ModelOverridesRequest,
    ModelOverridesResponse,
    MasterResumePreviewResponse,
    PromptConfigRequest,
    PromptConfigResponse,
    PromptCatalogEntry,
    PromptCatalogResponse,
    PromptComposerPutRequest,
    PromptComposerResponse,
    PromptInstructionPutRequest,
    PromptOption,
    PromptOverrideSuccess,
    PromptRulesPutRequest,
    ApiKeyProviderStatus,
    ApiKeyStatusResponse,
    ApiKeysUpdateRequest,
    ApiKeysUpdateResponse,
    ResetDatabaseRequest,
    SharedRuleOverrideSuccess,
    SharedRulesPutRequest,
)
from app.prompts import DEFAULT_IMPROVE_PROMPT_ID, IMPROVE_PROMPT_OPTIONS
from app.prompts._constants import PROMPT_VERSIONS
from app.prompts.answer_questions import APPLICATION_QUESTIONS_PROMPT, APPLICATION_QUESTIONS_SYSTEM_PROMPT
from app.prompts.cover_letter import COMBINED_MESSAGES_SYSTEM_PROMPT, COVER_LETTER_OUTREACH_PROMPT
from app.prompts.enrichment import (
    ANALYZE_RESUME_PROMPT,
    ENHANCE_DESCRIPTION_PROMPT,
    ENRICHMENT_ANALYZE_SYSTEM_PROMPT,
    ENRICHMENT_ENHANCE_SYSTEM_PROMPT,
    ENRICHMENT_REGENERATE_SYSTEM_PROMPT,
    REGENERATE_ADDITIONAL_GROUP_PROMPT,
    REGENERATE_ITEM_PROMPT,
)
from app.prompts.extract_jd_intel import EXTRACT_JD_INTELLIGENCE_PROMPT, EXTRACT_JD_INTELLIGENCE_SYSTEM_PROMPT
from app.prompts.parse_resume import PARSE_RESUME_PROMPT, PARSE_SYSTEM_PROMPT
from app.prompts.tailoring_blocks import (
    TAILORING_CONTRACT_BLOCK,
    TAILORING_CRAFT_BLOCK,
    TAILORING_MODE_STRATEGY,
    TAILORING_USER_SHELL_FULL,
)
from app.prompts.tailoring_catalog import build_resume_tailoring_catalog_sections
from app.routers.prompt_catalog_builder import (
    build_composer_snapshot,
    build_prompt_manager_entries,
    build_shared_rule_entries,
)
from app.services.tailoring.master_resume_preview import capped_master_resume_preview_text
from app.config import (
    get_api_keys_from_config,
    save_api_keys_to_config,
    delete_api_key_from_config,
    clear_all_api_keys,
)
from app.config_cache import invalidate_config_cache
from app.database import db

router = APIRouter(prefix="/config", tags=["Configuration"])
CLIPROXY_DEFAULT_BASE_URL = "http://127.0.0.1:8317/v1"
CLIPROXY_DEFAULT_DASHBOARD_PATH = "/management.html"


def _normalize_provider_filter(value: str | None) -> str:
    if value and value in CLIPROXY_PROVIDER_FILTERS:
        return value
    return "mixed"


def _mask_or_empty(value: str | None) -> str:
    return _mask_api_key(value or "")


def _normalize_cliproxy(stored: dict) -> dict:
    cliproxy = stored.get("cliproxy", {})
    if not isinstance(cliproxy, dict):
        cliproxy = {}

    quick_profiles: list[dict] = []
    raw_profiles = cliproxy.get("quick_profiles")
    if isinstance(raw_profiles, list):
        for row in raw_profiles:
            if not isinstance(row, dict):
                continue
            name = str(row.get("name") or "").strip()
            model_alias = str(row.get("model_alias") or "").strip()
            if not name or not model_alias:
                continue
            quick_profiles.append(
                {
                    "name": name,
                    "provider_filter": _normalize_provider_filter(
                        str(row.get("provider_filter") or "mixed").strip().lower()
                    ),
                    "model_alias": model_alias,
                    "base_url": str(row.get("base_url") or "").strip() or None,
                }
            )

    base_url = str(cliproxy.get("base_url") or "").strip()
    dashboard_url = str(cliproxy.get("dashboard_url") or "").strip()
    if not dashboard_url:
        normalized_base = normalize_cliproxy_api_base(base_url or CLIPROXY_DEFAULT_BASE_URL)
        dashboard_url = normalized_base.removesuffix("/v1") + CLIPROXY_DEFAULT_DASHBOARD_PATH

    return {
        "base_url": normalize_cliproxy_api_base(base_url or CLIPROXY_DEFAULT_BASE_URL),
        "client_api_key": str(cliproxy.get("client_api_key") or "").strip(),
        "provider_filter": _normalize_provider_filter(
            str(cliproxy.get("provider_filter") or "mixed").strip().lower()
        ),
        "model_alias": str(cliproxy.get("model_alias") or "").strip(),
        "dashboard_url": dashboard_url,
        "quick_profiles": quick_profiles,
    }


def _build_llm_config_response(stored: dict) -> LLMConfigResponse:
    provider = stored.get("provider", settings.llm_provider)
    ai_route = normalize_ai_route(stored.get("ai_route"))
    cliproxy = _normalize_cliproxy(stored)

    return LLMConfigResponse(
        provider=provider,
        model=stored.get("model", settings.llm_model),
        api_key=_mask_api_key(resolve_api_key(stored, provider)),
        api_base=stored.get("api_base", settings.llm_api_base),
        ai_route=ai_route,
        cliproxy=CLIProxyConfigResponse(
            base_url=cliproxy["base_url"],
            client_api_key=_mask_or_empty(cliproxy.get("client_api_key")),
            provider_filter=cliproxy["provider_filter"],
            model_alias=cliproxy["model_alias"],
            dashboard_url=cliproxy["dashboard_url"],
            quick_profiles=[CLIProxyQuickProfile(**row) for row in cliproxy["quick_profiles"]],
        ),
        cliproxy_route_enabled=settings.enable_cliproxy_route,
    )


def _cliproxy_model_provider(model_id: str) -> str:
    name = model_id.strip().lower()
    if not name:
        return "mixed"
    if "claude" in name:
        return "claude"
    if "gemini" in name:
        return "gemini"
    if "codex" in name or name.startswith("gpt-"):
        return "codex"
    return "mixed"


def _get_config_path() -> Path:
    """Get path to config storage file."""
    return settings.config_path


def _load_config() -> dict:
    """Load config from file."""
    path = _get_config_path()
    if path.exists():
        return json.loads(path.read_text())
    return {}


def _save_config(config: dict) -> None:
    """Save config to file and invalidate the resume router's cache."""
    path = _get_config_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(config, indent=2))
    invalidate_config_cache()


def _mask_api_key(key: str) -> str:
    """Mask API key for display."""
    if not key:
        return ""
    if len(key) <= 8:
        return "*" * len(key)
    return key[:4] + "*" * (len(key) - 8) + key[-4:]


def _get_prompt_options() -> list[PromptOption]:
    """Return available prompt options for resume tailoring."""
    return [PromptOption(**option) for option in IMPROVE_PROMPT_OPTIONS]


def _legacy_prompt_catalog_rows() -> list[PromptCatalogEntry]:
    """Legacy flat catalog rows (operations, enrichment, health)."""
    return [
        PromptCatalogEntry(
            id="llm_health_check",
            operation="health_check",
            version="v1",
            system_prompt=None,
            user_prompt=LLM_HEALTH_CHECK_PROMPT,
            notes="Connection smoke test prompt used by /config/llm-test and status checks.",
        ),
        PromptCatalogEntry(
            id="resume_parse_json",
            operation="resume_parse",
            version=PROMPT_VERSIONS.get("parse_resume"),
            system_prompt=PARSE_SYSTEM_PROMPT,
            user_prompt=PARSE_RESUME_PROMPT,
        ),
        PromptCatalogEntry(
            id="job_extract_keywords",
            operation="job_intelligence_extract",
            version=PROMPT_VERSIONS.get("extract_keywords"),
            system_prompt=EXTRACT_JD_INTELLIGENCE_SYSTEM_PROMPT,
            user_prompt=EXTRACT_JD_INTELLIGENCE_PROMPT,
        ),
        PromptCatalogEntry(
            id="resume_generate_full",
            operation="resume_tailoring",
            version=PROMPT_VERSIONS.get("tailoring_user"),
            system_prompt="\n\n".join(
                [
                    TAILORING_CRAFT_BLOCK,
                    TAILORING_MODE_STRATEGY["full"],
                    TAILORING_CONTRACT_BLOCK,
                ]
            ),
            user_prompt=TAILORING_USER_SHELL_FULL,
            sections=build_resume_tailoring_catalog_sections(),
        ),
        PromptCatalogEntry(
            id="cover_letter_outreach_generate",
            operation="messages_generate",
            version=PROMPT_VERSIONS.get("cover_letter_outreach"),
            system_prompt=COMBINED_MESSAGES_SYSTEM_PROMPT,
            user_prompt=COVER_LETTER_OUTREACH_PROMPT,
        ),
        PromptCatalogEntry(
            id="application_questions_generate",
            operation="application_questions_generate",
            version=PROMPT_VERSIONS.get("application_questions_generate"),
            system_prompt=APPLICATION_QUESTIONS_SYSTEM_PROMPT,
            user_prompt=APPLICATION_QUESTIONS_PROMPT,
        ),
        PromptCatalogEntry(
            id="enrichment_analyze",
            operation="enrichment_analyze",
            version=PROMPT_VERSIONS.get("enrichment_analyze"),
            system_prompt=ENRICHMENT_ANALYZE_SYSTEM_PROMPT,
            user_prompt=ANALYZE_RESUME_PROMPT,
            notes="Shipped: text/enrichment/analyze_system.txt, text/enrichment/analyze_user.txt (str.format: resume_json).",
        ),
        PromptCatalogEntry(
            id="enrichment_enhance",
            operation="enrichment_enhance",
            version=PROMPT_VERSIONS.get("enrichment_enhance"),
            system_prompt=ENRICHMENT_ENHANCE_SYSTEM_PROMPT,
            user_prompt=ENHANCE_DESCRIPTION_PROMPT,
            notes="Shipped: text/enrichment/enhance_system.txt, text/enrichment/enhance_user.txt (str.format).",
        ),
        PromptCatalogEntry(
            id="enrichment_regenerate_item",
            operation="enrichment_regenerate_item",
            version=PROMPT_VERSIONS.get("enrichment_regenerate_item"),
            system_prompt=ENRICHMENT_REGENERATE_SYSTEM_PROMPT,
            user_prompt=REGENERATE_ITEM_PROMPT,
            notes="Shipped: text/enrichment/regenerate_system.txt, text/enrichment/regenerate_item_user.txt (str.format).",
        ),
        PromptCatalogEntry(
            id="enrichment_regenerate_group",
            operation="enrichment_regenerate_group",
            version=PROMPT_VERSIONS.get("enrichment_regenerate_group"),
            system_prompt=ENRICHMENT_REGENERATE_SYSTEM_PROMPT,
            user_prompt=REGENERATE_ADDITIONAL_GROUP_PROMPT,
            notes="Shipped: text/enrichment/regenerate_system.txt, text/enrichment/regenerate_group_user.txt (str.format).",
        ),
    ]


def _get_prompt_catalog_response() -> PromptCatalogResponse:
    return PromptCatalogResponse(
        prompts=_legacy_prompt_catalog_rows(),
        entries=build_prompt_manager_entries(),
        shared_rules=build_shared_rule_entries(),
    )


_PROMPT_ID_MIGRATION = {
    "nudge": "lite",
    "light": "lite",
    "keywords": "full",
}


def _resolve_prompt_id(value: str | None, option_ids: set[str]) -> str:
    if value in option_ids:
        return value
    migrated = _PROMPT_ID_MIGRATION.get(value) if value else None
    if migrated and migrated in option_ids:
        return migrated
    return DEFAULT_IMPROVE_PROMPT_ID


def _normalize_generation_defaults(stored: dict) -> GenerationDefaultsResponse:
    options = _get_prompt_options()
    option_ids = {option.id for option in options}
    defaults = stored.get("generation_defaults")
    if not isinstance(defaults, dict):
        defaults = {}

    prompt_id = _resolve_prompt_id(
        defaults.get("prompt_id") or stored.get("default_prompt_id"),
        option_ids,
    )

    return GenerationDefaultsResponse(
        include_cover_letter=bool(defaults.get("include_cover_letter", False)),
        include_outreach_message=bool(defaults.get("include_outreach_message", False)),
        prompt_id=prompt_id,
    )


@router.get("/llm-api-key", response_model=LLMConfigResponse)
async def get_llm_config_endpoint() -> LLMConfigResponse:
    """Get current LLM configuration (API key masked)."""
    return _build_llm_config_response(_load_config())


@router.put("/llm-api-key", response_model=LLMConfigResponse)
async def update_llm_config(
    request: LLMConfigRequest,
) -> LLMConfigResponse:
    """Update LLM configuration.

    Saves the configuration and returns it (API key masked).

    Note: We intentionally do NOT hard-fail the update based on a live health check.
    Users may configure proxies/aggregators or temporarily unavailable endpoints and
    still need to persist the configuration. Connectivity can be verified via
    `/config/llm-test` and the System Status panel.
    """
    stored = _load_config()

    # Update only provided fields
    if request.provider is not None:
        stored["provider"] = request.provider
    if request.model is not None:
        stored["model"] = request.model
    if request.api_key is not None:
        stored["api_key"] = request.api_key
    if request.api_base is not None:
        stored["api_base"] = request.api_base
    if request.ai_route is not None:
        if request.ai_route == AI_ROUTE_CLIPROXY and not settings.enable_cliproxy_route:
            raise HTTPException(
                status_code=400,
                detail="CLIProxy route is disabled by server configuration.",
            )
        stored["ai_route"] = request.ai_route

    if request.cliproxy is not None:
        cliproxy = stored.get("cliproxy", {})
        if not isinstance(cliproxy, dict):
            cliproxy = {}

        if request.cliproxy.base_url is not None:
            cliproxy["base_url"] = request.cliproxy.base_url
        if request.cliproxy.client_api_key is not None:
            cliproxy["client_api_key"] = request.cliproxy.client_api_key
        if request.cliproxy.provider_filter is not None:
            cliproxy["provider_filter"] = request.cliproxy.provider_filter
        if request.cliproxy.model_alias is not None:
            cliproxy["model_alias"] = request.cliproxy.model_alias
        if request.cliproxy.dashboard_url is not None:
            cliproxy["dashboard_url"] = request.cliproxy.dashboard_url
        if request.cliproxy.quick_profiles is not None:
            cliproxy["quick_profiles"] = [
                profile.model_dump(exclude_none=True)
                for profile in request.cliproxy.quick_profiles
            ]

        stored["cliproxy"] = cliproxy

    # Build normalized config for response
    # Save config regardless of health check outcome (see docstring).
    _save_config(stored)
    return _build_llm_config_response(stored)


@router.post("/llm-test")
async def test_llm_connection(request: LLMConfigRequest | None = None) -> dict:
    """Test LLM connection with provided or stored configuration.

    If request body is provided, tests with those values (for pre-save testing).
    Otherwise, tests with the currently saved configuration.
    """
    stored = _load_config()

    ai_route = normalize_ai_route(
        request.ai_route if request and request.ai_route is not None else stored.get("ai_route")
    )

    if ai_route == AI_ROUTE_CLIPROXY:
        if not settings.enable_cliproxy_route:
            raise HTTPException(
                status_code=400,
                detail="CLIProxy route is disabled by server configuration.",
            )

        stored_cliproxy = _normalize_cliproxy(stored)
        request_cliproxy = request.cliproxy if request else None
        base_url = (
            request_cliproxy.base_url
            if request_cliproxy and request_cliproxy.base_url is not None
            else stored_cliproxy["base_url"]
        )
        model_alias = (
            request_cliproxy.model_alias
            if request_cliproxy and request_cliproxy.model_alias is not None
            else stored_cliproxy["model_alias"]
        )
        api_key = (
            request_cliproxy.client_api_key
            if request_cliproxy and request_cliproxy.client_api_key is not None
            else stored_cliproxy["client_api_key"]
        )
        if request and request.model:
            model_alias = request.model
        if request and request.api_key:
            api_key = request.api_key
        if request and request.api_base is not None:
            base_url = request.api_base

        config = LLMConfig(
            provider="openai",
            model=(model_alias or settings.llm_model),
            api_key=api_key or "",
            api_base=normalize_cliproxy_api_base(base_url),
            ai_route=AI_ROUTE_CLIPROXY,
            route_provider_filter=(
                request_cliproxy.provider_filter
                if request_cliproxy and request_cliproxy.provider_filter
                else stored_cliproxy["provider_filter"]
            ),
        )
    else:
        # Build config: use request values if provided, otherwise fall back to stored/default
        test_provider = (
            request.provider
            if request and request.provider
            else stored.get("provider", settings.llm_provider)
        )
        config = LLMConfig(
            provider=test_provider,
            model=(
                request.model
                if request and request.model
                else stored.get("model", settings.llm_model)
            ),
            api_key=(
                request.api_key
                if request and request.api_key
                else resolve_api_key(stored, test_provider)
            ),
            api_base=(
                request.api_base
                if request and request.api_base is not None
                else stored.get("api_base", settings.llm_api_base)
            ),
            ai_route=AI_ROUTE_DIRECT,
        )

    test_prompt = "Hi"
    return await check_llm_health(
        config,
        include_details=True,
        test_prompt=test_prompt,
        use_cache=False,
        source="config_test",
    )


@router.post("/cliproxy-models", response_model=CLIProxyModelsResponse)
async def discover_cliproxy_models(
    request: CLIProxyModelsRequest | None = None,
) -> CLIProxyModelsResponse:
    """Discover available model aliases from a CLIProxyAPI instance."""
    if not settings.enable_cliproxy_route:
        raise HTTPException(
            status_code=400,
            detail="CLIProxy route is disabled by server configuration.",
        )

    stored = _load_config()
    stored_cliproxy = _normalize_cliproxy(stored)
    provider_filter = _normalize_provider_filter(
        request.provider_filter if request and request.provider_filter else stored_cliproxy["provider_filter"]
    )
    base_url = normalize_cliproxy_api_base(
        request.base_url if request and request.base_url is not None else stored_cliproxy["base_url"]
    )
    api_key = (
        request.client_api_key
        if request and request.client_api_key is not None
        else stored_cliproxy["client_api_key"]
    )
    if not api_key:
        raise HTTPException(
            status_code=400,
            detail="CLIProxy client API key is required to fetch models.",
        )

    models_url = base_url.rstrip("/") + "/models"
    req = urllib_request.Request(
        models_url,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Accept": "application/json",
        },
        method="GET",
    )

    try:
        with urllib_request.urlopen(req, timeout=20) as resp:
            payload = resp.read().decode("utf-8")
    except urllib_error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore").strip()
        raise HTTPException(
            status_code=502,
            detail=(
                f"CLIProxy model discovery failed ({exc.code}). "
                f"{detail or 'Check base URL and API key.'}"
            ),
        ) from exc
    except urllib_error.URLError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"CLIProxy model discovery failed: {exc.reason}",
        ) from exc

    try:
        decoded = json.loads(payload)
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=502,
            detail="CLIProxy model discovery returned invalid JSON.",
        ) from exc

    rows = decoded.get("data", []) if isinstance(decoded, dict) else []
    by_model_id: dict[str, str | None] = {}
    for row in rows:
        if not isinstance(row, dict):
            continue
        model_id = str(row.get("id") or "").strip()
        if not model_id:
            continue
        raw_owner = row.get("owned_by")
        owned_by = str(raw_owner).strip() if raw_owner is not None else None
        if owned_by == "":
            owned_by = None
        by_model_id[model_id] = owned_by

    options: list[CLIProxyModelOption] = []
    for model_id, owned_by in sorted(by_model_id.items(), key=lambda t: t[0].lower()):
        provider = _cliproxy_model_provider(model_id)
        if provider_filter != "mixed" and provider != provider_filter:
            continue
        options.append(
            CLIProxyModelOption(id=model_id, provider=provider, owned_by=owned_by)
        )

    return CLIProxyModelsResponse(
        models=options,
        provider_filter=provider_filter,
    )


@router.get("/features", response_model=FeatureConfigResponse)
async def get_feature_config() -> FeatureConfigResponse:
    """Get current feature configuration."""
    stored = _load_config()

    return FeatureConfigResponse(
        enable_cover_letter=stored.get("enable_cover_letter", False),
        enable_outreach_message=stored.get("enable_outreach_message", False),
    )


@router.put("/features", response_model=FeatureConfigResponse)
async def update_feature_config(request: FeatureConfigRequest) -> FeatureConfigResponse:
    """Update feature configuration."""
    stored = _load_config()

    # Update only provided fields
    if request.enable_cover_letter is not None:
        stored["enable_cover_letter"] = request.enable_cover_letter
    if request.enable_outreach_message is not None:
        stored["enable_outreach_message"] = request.enable_outreach_message

    # Save config
    _save_config(stored)

    return FeatureConfigResponse(
        enable_cover_letter=stored.get("enable_cover_letter", False),
        enable_outreach_message=stored.get("enable_outreach_message", False),
    )


@router.get("/generation-defaults", response_model=GenerationDefaultsResponse)
async def get_generation_defaults() -> GenerationDefaultsResponse:
    """Get the last-used tailoring defaults for the create-resume flow."""
    return _normalize_generation_defaults(_load_config())


@router.put("/generation-defaults", response_model=GenerationDefaultsResponse)
async def update_generation_defaults(
    request: GenerationDefaultsRequest,
) -> GenerationDefaultsResponse:
    """Update the last-used tailoring defaults for the create-resume flow."""
    stored = _load_config()
    defaults = stored.get("generation_defaults")
    if not isinstance(defaults, dict):
        defaults = {}

    options = _get_prompt_options()
    option_ids = {option.id for option in options}

    if request.include_cover_letter is not None:
        defaults["include_cover_letter"] = request.include_cover_letter
    if request.include_outreach_message is not None:
        defaults["include_outreach_message"] = request.include_outreach_message
    if request.prompt_id is not None:
        if request.prompt_id in option_ids:
            defaults["prompt_id"] = request.prompt_id
        else:
            migrated = _PROMPT_ID_MIGRATION.get(request.prompt_id)
            if migrated and migrated in option_ids:
                defaults["prompt_id"] = migrated
            else:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "Unsupported prompt id: "
                        f"{request.prompt_id}. Supported: {sorted(option_ids)}"
                    ),
                )

    stored["generation_defaults"] = defaults
    _save_config(stored)
    return _normalize_generation_defaults(stored)


# Application UI and generated copy are English only.
SUPPORTED_LANGUAGES = ["en"]


def _coerce_language(value: object | None, fallback: str = "en") -> str:
    if isinstance(value, str) and value in SUPPORTED_LANGUAGES:
        return value
    if fallback in SUPPORTED_LANGUAGES:
        return fallback
    return "en"


@router.get("/language", response_model=LanguageConfigResponse)
async def get_language_config() -> LanguageConfigResponse:
    """Get current language configuration."""
    stored = _load_config()

    # Support legacy single 'language' field migration
    legacy_language = _coerce_language(stored.get("language"))

    return LanguageConfigResponse(
        ui_language=_coerce_language(stored.get("ui_language"), legacy_language),
        content_language=_coerce_language(stored.get("content_language"), legacy_language),
        supported_languages=SUPPORTED_LANGUAGES,
    )


@router.put("/language", response_model=LanguageConfigResponse)
async def update_language_config(
    request: LanguageConfigRequest,
) -> LanguageConfigResponse:
    """Update language configuration."""
    stored = _load_config()

    # Validate and update UI language
    if request.ui_language is not None:
        if request.ui_language not in SUPPORTED_LANGUAGES:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported UI language: {request.ui_language}. Supported: {SUPPORTED_LANGUAGES}",
            )
        stored["ui_language"] = request.ui_language

    # Validate and update content language
    if request.content_language is not None:
        if request.content_language not in SUPPORTED_LANGUAGES:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported content language: {request.content_language}. Supported: {SUPPORTED_LANGUAGES}",
            )
        stored["content_language"] = request.content_language

    # Save config
    _save_config(stored)

    # Support legacy single 'language' field migration
    legacy_language = _coerce_language(stored.get("language"))

    return LanguageConfigResponse(
        ui_language=_coerce_language(stored.get("ui_language"), legacy_language),
        content_language=_coerce_language(stored.get("content_language"), legacy_language),
        supported_languages=SUPPORTED_LANGUAGES,
    )


@router.get("/prompts", response_model=PromptConfigResponse)
async def get_prompt_config() -> PromptConfigResponse:
    """Get current prompt configuration for resume tailoring."""
    stored = _load_config()
    options = _get_prompt_options()
    option_ids = {option.id for option in options}
    default_prompt_id = stored.get("default_prompt_id", DEFAULT_IMPROVE_PROMPT_ID)
    if default_prompt_id not in option_ids:
        default_prompt_id = DEFAULT_IMPROVE_PROMPT_ID

    return PromptConfigResponse(
        default_prompt_id=default_prompt_id,
        prompt_options=options,
    )


@router.put("/prompts", response_model=PromptConfigResponse)
async def update_prompt_config(
    request: PromptConfigRequest,
) -> PromptConfigResponse:
    """Update prompt configuration for resume tailoring."""
    stored = _load_config()
    options = _get_prompt_options()
    option_ids = {option.id for option in options}

    if request.default_prompt_id is not None:
        if request.default_prompt_id not in option_ids:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Unsupported prompt id: "
                    f"{request.default_prompt_id}. Supported: {sorted(option_ids)}"
                ),
            )
        stored["default_prompt_id"] = request.default_prompt_id

    _save_config(stored)

    default_prompt_id = stored.get("default_prompt_id", DEFAULT_IMPROVE_PROMPT_ID)
    if default_prompt_id not in option_ids:
        default_prompt_id = DEFAULT_IMPROVE_PROMPT_ID

    return PromptConfigResponse(
        default_prompt_id=default_prompt_id,
        prompt_options=options,
    )


@router.get("/prompts/catalog", response_model=PromptCatalogResponse)
async def get_prompt_catalog() -> PromptCatalogResponse:
    """Return read-only catalog of prompt templates currently used by LLM operations."""
    return _get_prompt_catalog_response()


@router.get("/prompts/catalog/master-resume-preview", response_model=MasterResumePreviewResponse)
async def get_master_resume_preview() -> MasterResumePreviewResponse:
    text, truncated = capped_master_resume_preview_text(db)
    return MasterResumePreviewResponse(serialized_original_resume=text, truncated=truncated)


@router.get("/critique", response_model=CritiqueConfigResponse)
async def get_critique_config() -> CritiqueConfigResponse:
    stored = _load_config()
    raw = stored.get("enable_critique")
    enabled = True if raw is None else bool(raw)
    return CritiqueConfigResponse(enabled=enabled)


@router.put("/critique", response_model=CritiqueConfigResponse)
async def put_critique_config(request: CritiqueConfigRequest) -> CritiqueConfigResponse:
    stored = _load_config()
    stored["enable_critique"] = request.enabled
    _save_config(stored)
    return CritiqueConfigResponse(enabled=request.enabled)


@router.get("/model-overrides", response_model=ModelOverridesResponse)
async def get_model_overrides() -> ModelOverridesResponse:
    stored = _load_config()
    raw = stored.get("model_overrides")
    if not isinstance(raw, dict):
        return ModelOverridesResponse(overrides={})
    out: dict[str, str | None] = {}
    for k, v in raw.items():
        if v is None:
            out[str(k)] = None
        else:
            out[str(k)] = str(v)
    return ModelOverridesResponse(overrides=out)


@router.put("/model-overrides", response_model=ModelOverridesResponse)
async def put_model_overrides(request: ModelOverridesRequest) -> ModelOverridesResponse:
    stored = _load_config()
    stored["model_overrides"] = dict(request.overrides)
    _save_config(stored)
    return ModelOverridesResponse(overrides=dict(request.overrides))


@router.put("/prompts/{step_name}/instructions", response_model=PromptOverrideSuccess)
async def put_prompt_instructions(
    step_name: str,
    request: PromptInstructionPutRequest,
) -> PromptOverrideSuccess:
    from app.prompts import VALID_STEPS, save_override

    if step_name not in VALID_STEPS:
        raise HTTPException(status_code=404, detail="Unknown prompt step.")
    save_override(step_name, "instructions", request.instructions)
    return PromptOverrideSuccess(success=True, step_name=step_name)


@router.delete("/prompts/{step_name}/instructions", response_model=PromptOverrideSuccess)
async def delete_prompt_instructions(step_name: str) -> PromptOverrideSuccess:
    from app.prompts import VALID_STEPS, delete_override

    if step_name not in VALID_STEPS:
        raise HTTPException(status_code=404, detail="Unknown prompt step.")
    delete_override(step_name, "instructions")
    return PromptOverrideSuccess(success=True, step_name=step_name)


@router.put("/prompts/{step_name}/rules", response_model=PromptOverrideSuccess)
async def put_prompt_rules(step_name: str, request: PromptRulesPutRequest) -> PromptOverrideSuccess:
    from app.prompts import VALID_STEPS, save_override

    if step_name not in VALID_STEPS:
        raise HTTPException(status_code=404, detail="Unknown prompt step.")
    save_override(step_name, "rules", request.rules)
    return PromptOverrideSuccess(success=True, step_name=step_name)


@router.delete("/prompts/{step_name}/rules", response_model=PromptOverrideSuccess)
async def delete_prompt_rules(step_name: str) -> PromptOverrideSuccess:
    from app.prompts import VALID_STEPS, delete_override

    if step_name not in VALID_STEPS:
        raise HTTPException(status_code=404, detail="Unknown prompt step.")
    delete_override(step_name, "rules")
    return PromptOverrideSuccess(success=True, step_name=step_name)


@router.get("/prompts/{step_name}/composer", response_model=PromptComposerResponse)
async def get_prompt_composer(step_name: str) -> PromptComposerResponse:
    from app.prompts import VALID_STEPS

    if step_name not in VALID_STEPS:
        raise HTTPException(status_code=404, detail="Unknown prompt step.")
    try:
        return build_composer_snapshot(step_name)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.put("/prompts/{step_name}/composer", response_model=PromptComposerResponse)
async def put_prompt_composer(
    step_name: str,
    request: PromptComposerPutRequest,
) -> PromptComposerResponse:
    from app.prompts import VALID_STEPS, get_prompt, save_composer_override, validate_user_template_against_variables

    if step_name not in VALID_STEPS:
        raise HTTPException(status_code=404, detail="Unknown prompt step.")
    mod = get_prompt(step_name)
    raw_vars = getattr(mod, "VARIABLES", None)
    if not isinstance(raw_vars, dict):
        raise HTTPException(status_code=500, detail="Step module missing VARIABLES dict.")
    allowed = frozenset(str(k) for k in raw_vars.keys())
    try:
        validate_user_template_against_variables(request.user, allowed)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    save_composer_override(step_name, request.system, request.user)
    return build_composer_snapshot(step_name)


@router.delete("/prompts/{step_name}/composer", response_model=PromptComposerResponse)
async def delete_prompt_composer(step_name: str) -> PromptComposerResponse:
    from app.prompts import VALID_STEPS, delete_composer_override

    if step_name not in VALID_STEPS:
        raise HTTPException(status_code=404, detail="Unknown prompt step.")
    delete_composer_override(step_name)
    return build_composer_snapshot(step_name)


@router.put("/shared-rules/{rules_name}", response_model=SharedRuleOverrideSuccess)
async def put_shared_rules(
    rules_name: str,
    request: SharedRulesPutRequest,
) -> SharedRuleOverrideSuccess:
    from app.prompts import save_shared_rules_override
    from app.prompts._rules.critique import USED_BY as CRITIQUE_USED_BY
    from app.prompts._rules.jd_intel import USED_BY as JD_USED_BY
    from app.prompts._rules.resume_diff import USED_BY as RD_USED_BY

    affected: list[str]
    if rules_name == "resume_diff":
        affected = list(RD_USED_BY)
    elif rules_name == "jd_intel":
        affected = list(JD_USED_BY)
    elif rules_name == "critique":
        affected = list(CRITIQUE_USED_BY)
    else:
        raise HTTPException(status_code=404, detail="Unknown shared rules name.")
    save_shared_rules_override(rules_name, request.rules)
    return SharedRuleOverrideSuccess(success=True, rules_name=rules_name, affected_steps=affected)


@router.delete("/shared-rules/{rules_name}", response_model=SharedRuleOverrideSuccess)
async def delete_shared_rules(rules_name: str) -> SharedRuleOverrideSuccess:
    from app.prompts import delete_shared_rules_override
    from app.prompts._rules.critique import USED_BY as CRITIQUE_USED_BY
    from app.prompts._rules.jd_intel import USED_BY as JD_USED_BY
    from app.prompts._rules.resume_diff import USED_BY as RD_USED_BY

    affected: list[str]
    if rules_name == "resume_diff":
        affected = list(RD_USED_BY)
    elif rules_name == "jd_intel":
        affected = list(JD_USED_BY)
    elif rules_name == "critique":
        affected = list(CRITIQUE_USED_BY)
    else:
        raise HTTPException(status_code=404, detail="Unknown shared rules name.")
    delete_shared_rules_override(rules_name)
    return SharedRuleOverrideSuccess(success=True, rules_name=rules_name, affected_steps=affected)


# Supported API key providers
SUPPORTED_PROVIDERS = ["openai", "anthropic", "google", "openrouter", "deepseek"]


def _mask_key_short(key: str | None) -> str | None:
    """Mask API key showing only last 4 characters."""
    if not key:
        return None
    if len(key) <= 4:
        return "*" * len(key)
    return "..." + key[-4:]


@router.get("/api-keys", response_model=ApiKeyStatusResponse)
async def get_api_keys_status() -> ApiKeyStatusResponse:
    """Get status of all configured API keys (masked).

    Returns the configuration status for each supported provider.
    API keys are masked to show only the last 4 characters.
    """
    stored_keys = get_api_keys_from_config()

    providers = []
    for provider in SUPPORTED_PROVIDERS:
        key = stored_keys.get(provider)
        providers.append(
            ApiKeyProviderStatus(
                provider=provider,
                configured=bool(key),
                masked_key=_mask_key_short(key),
            )
        )

    return ApiKeyStatusResponse(providers=providers)


@router.post("/api-keys", response_model=ApiKeysUpdateResponse)
async def update_api_keys(request: ApiKeysUpdateRequest) -> ApiKeysUpdateResponse:
    """Update API keys for one or more providers.

    Only updates the providers that are explicitly set in the request.
    Empty strings will clear the key for that provider.
    """
    stored_keys = get_api_keys_from_config()
    updated = []

    # Update each provider if provided in request
    if request.openai is not None:
        if request.openai:
            stored_keys["openai"] = request.openai
        elif "openai" in stored_keys:
            del stored_keys["openai"]
        updated.append("openai")

    if request.anthropic is not None:
        if request.anthropic:
            stored_keys["anthropic"] = request.anthropic
        elif "anthropic" in stored_keys:
            del stored_keys["anthropic"]
        updated.append("anthropic")

    if request.google is not None:
        if request.google:
            stored_keys["google"] = request.google
        elif "google" in stored_keys:
            del stored_keys["google"]
        updated.append("google")

    if request.openrouter is not None:
        if request.openrouter:
            stored_keys["openrouter"] = request.openrouter
        elif "openrouter" in stored_keys:
            del stored_keys["openrouter"]
        updated.append("openrouter")

    if request.deepseek is not None:
        if request.deepseek:
            stored_keys["deepseek"] = request.deepseek
        elif "deepseek" in stored_keys:
            del stored_keys["deepseek"]
        updated.append("deepseek")

    save_api_keys_to_config(stored_keys)
    invalidate_config_cache()

    return ApiKeysUpdateResponse(
        message=f"Updated {len(updated)} API key(s)",
        updated_providers=updated,
    )


@router.delete("/api-keys")
async def delete_all_api_keys(confirm: str | None = None) -> dict:
    """Clear all configured API keys.

    This is a destructive operation. Requires confirmation token.

    Args:
        confirm: Must be "CLEAR_ALL_KEYS" to execute

    Returns:
        Success message

    Note:
        This is a local-only endpoint for single-user deployments.
        In production/multi-user scenarios, add proper authentication.
    """
    if confirm != "CLEAR_ALL_KEYS":
        raise HTTPException(
            status_code=400,
            detail="Confirmation required. Pass confirm=CLEAR_ALL_KEYS query parameter.",
        )
    clear_all_api_keys()
    invalidate_config_cache()
    return {"message": "All API keys have been cleared"}


@router.delete("/api-keys/{provider}")
async def delete_api_key(provider: str) -> dict:
    """Delete API key for a specific provider.

    Args:
        provider: The provider name (openai, anthropic, google, openrouter, deepseek)

    Returns:
        Success message
    """
    if provider not in SUPPORTED_PROVIDERS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported provider: {provider}. Supported: {SUPPORTED_PROVIDERS}",
        )

    delete_api_key_from_config(provider)
    invalidate_config_cache()

    return {"message": f"API key for {provider} has been removed"}


@router.post("/reset")
async def reset_database_endpoint(request: ResetDatabaseRequest) -> dict:
    """Reset the database and clear all data.

    WARNING: This action is irreversible. It will:
    1. Truncate all database tables (resumes, jobs, improvements)
    2. Delete all uploaded files

    Requires confirmation token for safety.

    Args:
        request: Request body containing confirmation token

    Returns:
        Success message

    Note:
        This is a local-only endpoint for single-user deployments.
        In production/multi-user scenarios, add proper authentication.
    """
    if request.confirm != "RESET_ALL_DATA":
        raise HTTPException(
            status_code=400,
            detail="Confirmation required. Pass confirm=RESET_ALL_DATA in request body.",
        )
    db.reset_database()
    return {"message": "Database and all data have been reset successfully"}
