"""multi-resume: is_master -> is_active, pin columns"""

revision = "0003_multi_resume_active_pin"
down_revision = "0002_llm_observability"
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa


def upgrade() -> None:
    op.drop_index(op.f("ix_resumes_is_master"), table_name="resumes")
    op.alter_column(
        "resumes",
        "is_master",
        new_column_name="is_active",
        existing_type=sa.Boolean(),
        existing_nullable=False,
    )
    op.create_index(op.f("ix_resumes_is_active"), "resumes", ["is_active"], unique=False)
    op.add_column(
        "resumes",
        sa.Column("is_pinned", sa.Boolean(), nullable=False, server_default="0"),
    )
    op.add_column(
        "resumes",
        sa.Column("pinned_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(op.f("ix_resumes_is_pinned"), "resumes", ["is_pinned"], unique=False)
    op.alter_column("resumes", "is_pinned", server_default=None)


def downgrade() -> None:
    op.drop_index(op.f("ix_resumes_is_pinned"), table_name="resumes")
    op.drop_column("resumes", "pinned_at")
    op.drop_column("resumes", "is_pinned")
    op.drop_index(op.f("ix_resumes_is_active"), table_name="resumes")
    op.alter_column(
        "resumes",
        "is_active",
        new_column_name="is_master",
        existing_type=sa.Boolean(),
        existing_nullable=False,
    )
    op.create_index(op.f("ix_resumes_is_master"), "resumes", ["is_master"], unique=False)
