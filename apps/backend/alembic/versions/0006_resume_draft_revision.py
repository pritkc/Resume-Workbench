"""add optimistic draft revision to resumes"""

from alembic import op
import sqlalchemy as sa


revision = "0006_resume_draft_revision"
down_revision = "0005_jd_training_fields"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "resumes",
        sa.Column("draft_revision", sa.Integer(), nullable=False, server_default="0"),
    )
    op.alter_column("resumes", "draft_revision", server_default=None)


def downgrade() -> None:
    op.drop_column("resumes", "draft_revision")
