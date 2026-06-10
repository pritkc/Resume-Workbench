"""jd training fields: content_hash and char_count on jobs table"""

revision = "0005_jd_training_fields"
down_revision = "0004_cv_metadata"
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa


def upgrade() -> None:
    op.add_column("jobs", sa.Column("content_hash", sa.String(64), nullable=True))
    op.add_column("jobs", sa.Column("char_count", sa.Integer(), nullable=True))
    op.create_index("ix_jobs_content_hash", "jobs", ["content_hash"])


def downgrade() -> None:
    op.drop_index("ix_jobs_content_hash", table_name="jobs")
    op.drop_column("jobs", "char_count")
    op.drop_column("jobs", "content_hash")
