"""resume cv_metadata YAML for dashboard targets + bold keywords list"""

revision = "0004_cv_metadata"
down_revision = "0003_multi_resume_active_pin"
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa


def upgrade() -> None:
    op.add_column(
        "resumes",
        sa.Column("cv_metadata", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("resumes", "cv_metadata")
