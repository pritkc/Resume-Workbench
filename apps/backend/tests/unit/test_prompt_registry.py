"""Registry: every VALID_STEPS module exposes build_messages and instruction/rule constants."""

import pytest

from app.prompts import VALID_STEPS, delete_shared_rules_override, get_prompt


@pytest.mark.parametrize("step_name", sorted(VALID_STEPS))
def test_get_prompt_loads_and_has_build_messages(step_name: str) -> None:
    mod = get_prompt(step_name)
    assert hasattr(mod, "build_messages")
    assert callable(mod.build_messages)
    assert hasattr(mod, "INSTRUCTIONS")
    assert hasattr(mod, "RULES")
    assert hasattr(mod, "DATA_TEMPLATE")


def test_delete_shared_rules_override_rejects_unknown_name() -> None:
    with pytest.raises(ValueError, match="Invalid shared rules name"):
        delete_shared_rules_override("not_a_valid_shared_rule")
