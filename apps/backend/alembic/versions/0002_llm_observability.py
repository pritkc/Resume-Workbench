"""add llm call observability table"""

revision = "0002_llm_observability"
down_revision = "0001_phase6_storage"
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa


def upgrade() -> None:
    op.create_table(
        "llm_calls",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("llm_call_id", sa.String(length=64), nullable=False),
        sa.Column("call_group_id", sa.String(length=64), nullable=False),
        sa.Column("trace_id", sa.String(length=64), nullable=True),
        sa.Column("request_scope", sa.String(length=128), nullable=True),
        sa.Column("operation", sa.String(length=128), nullable=False),
        sa.Column("provider", sa.String(length=64), nullable=False),
        sa.Column("model", sa.String(length=255), nullable=False),
        sa.Column("model_name", sa.String(length=255), nullable=False),
        sa.Column("response_model", sa.String(length=255), nullable=True),
        sa.Column("request_kind", sa.String(length=32), nullable=False),
        sa.Column("success", sa.Boolean(), nullable=False),
        sa.Column("attempt", sa.Integer(), nullable=False),
        sa.Column("max_tokens", sa.Integer(), nullable=True),
        sa.Column("temperature", sa.Float(), nullable=True),
        sa.Column("reasoning_effort", sa.String(length=64), nullable=True),
        sa.Column("json_mode", sa.Boolean(), nullable=False),
        sa.Column("latency_ms", sa.Integer(), nullable=True),
        sa.Column("finish_reason", sa.String(length=64), nullable=True),
        sa.Column("prompt_chars", sa.Integer(), nullable=False),
        sa.Column("prompt_tokens_est", sa.Integer(), nullable=True),
        sa.Column("response_chars", sa.Integer(), nullable=True),
        sa.Column("response_tokens_est", sa.Integer(), nullable=True),
        sa.Column("usage_input_tokens", sa.Integer(), nullable=True),
        sa.Column("usage_output_tokens", sa.Integer(), nullable=True),
        sa.Column("usage_total_tokens", sa.Integer(), nullable=True),
        sa.Column("estimated_input_cost_usd", sa.Float(), nullable=True),
        sa.Column("estimated_output_cost_usd", sa.Float(), nullable=True),
        sa.Column("estimated_total_cost_usd", sa.Float(), nullable=True),
        sa.Column("error_type", sa.String(length=128), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("prompt_preview", sa.Text(), nullable=True),
        sa.Column("response_preview", sa.Text(), nullable=True),
        sa.Column("request_context", sa.JSON(), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("llm_call_id"),
    )
    op.create_index(op.f("ix_llm_calls_llm_call_id"), "llm_calls", ["llm_call_id"], unique=True)
    op.create_index(op.f("ix_llm_calls_call_group_id"), "llm_calls", ["call_group_id"], unique=False)
    op.create_index(op.f("ix_llm_calls_trace_id"), "llm_calls", ["trace_id"], unique=False)
    op.create_index(op.f("ix_llm_calls_request_scope"), "llm_calls", ["request_scope"], unique=False)
    op.create_index(op.f("ix_llm_calls_operation"), "llm_calls", ["operation"], unique=False)
    op.create_index(op.f("ix_llm_calls_success"), "llm_calls", ["success"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_llm_calls_success"), table_name="llm_calls")
    op.drop_index(op.f("ix_llm_calls_operation"), table_name="llm_calls")
    op.drop_index(op.f("ix_llm_calls_request_scope"), table_name="llm_calls")
    op.drop_index(op.f("ix_llm_calls_trace_id"), table_name="llm_calls")
    op.drop_index(op.f("ix_llm_calls_call_group_id"), table_name="llm_calls")
    op.drop_index(op.f("ix_llm_calls_llm_call_id"), table_name="llm_calls")
    op.drop_table("llm_calls")
