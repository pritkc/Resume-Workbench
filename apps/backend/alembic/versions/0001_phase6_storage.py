"""phase 6 storage foundation"""

revision = "0001_phase6_storage"
down_revision = None
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_key", sa.String(length=64), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_key"),
    )
    op.create_table(
        "application_packs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("pack_id", sa.String(length=64), nullable=False),
        sa.Column("base_resume_id", sa.String(length=64), nullable=False),
        sa.Column("job_id", sa.String(length=64), nullable=False),
        sa.Column("tailored_resume_id", sa.String(length=64), nullable=True),
        sa.Column("generation_run_id", sa.String(length=64), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("company", sa.String(length=255), nullable=True),
        sa.Column("role", sa.String(length=255), nullable=True),
        sa.Column("location", sa.String(length=255), nullable=True),
        sa.Column("theme_settings", sa.JSON(), nullable=True),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("pack_id"),
    )
    op.create_index(op.f("ix_application_packs_pack_id"), "application_packs", ["pack_id"], unique=True)
    op.create_table(
        "resumes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("resume_id", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("content_type", sa.String(length=32), nullable=False),
        sa.Column("filename", sa.String(length=255), nullable=True),
        sa.Column("is_master", sa.Boolean(), nullable=False),
        sa.Column("parent_id", sa.String(length=64), nullable=True),
        sa.Column("application_pack_id", sa.String(length=64), nullable=True),
        sa.Column("processed_data", sa.JSON(), nullable=True),
        sa.Column("processing_status", sa.String(length=32), nullable=False),
        sa.Column("cover_letter", sa.Text(), nullable=True),
        sa.Column("outreach_message", sa.Text(), nullable=True),
        sa.Column("title", sa.String(length=255), nullable=True),
        sa.Column("original_markdown", sa.Text(), nullable=True),
        sa.Column("theme_settings", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("resume_id"),
    )
    op.create_index(op.f("ix_resumes_resume_id"), "resumes", ["resume_id"], unique=True)
    op.create_index(op.f("ix_resumes_is_master"), "resumes", ["is_master"], unique=False)
    op.create_index(op.f("ix_resumes_parent_id"), "resumes", ["parent_id"], unique=False)
    op.create_index(op.f("ix_resumes_application_pack_id"), "resumes", ["application_pack_id"], unique=False)
    op.create_table(
        "jobs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("job_id", sa.String(length=64), nullable=False),
        sa.Column("resume_id", sa.String(length=64), nullable=True),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("company", sa.String(length=255), nullable=True),
        sa.Column("role", sa.String(length=255), nullable=True),
        sa.Column("location", sa.String(length=255), nullable=True),
        sa.Column("job_metadata", sa.JSON(), nullable=True),
        sa.Column("job_keywords", sa.JSON(), nullable=True),
        sa.Column("job_keywords_hash", sa.String(length=128), nullable=True),
        sa.Column("preview_hash", sa.String(length=128), nullable=True),
        sa.Column("preview_prompt_id", sa.String(length=128), nullable=True),
        sa.Column("preview_hashes", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("job_id"),
    )
    op.create_index(op.f("ix_jobs_job_id"), "jobs", ["job_id"], unique=True)
    op.create_index(op.f("ix_jobs_resume_id"), "jobs", ["resume_id"], unique=False)
    op.create_table(
        "generation_runs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("generation_run_id", sa.String(length=64), nullable=False),
        sa.Column("application_pack_id", sa.String(length=64), nullable=True),
        sa.Column("source_resume_id", sa.String(length=64), nullable=True),
        sa.Column("tailored_resume_id", sa.String(length=64), nullable=True),
        sa.Column("job_id", sa.String(length=64), nullable=True),
        sa.Column("run_kind", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("prompt_id", sa.String(length=128), nullable=True),
        sa.Column("request_payload", sa.JSON(), nullable=True),
        sa.Column("result_payload", sa.JSON(), nullable=True),
        sa.Column("warnings", sa.JSON(), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("generation_run_id"),
    )
    op.create_index(op.f("ix_generation_runs_generation_run_id"), "generation_runs", ["generation_run_id"], unique=True)
    op.create_index(op.f("ix_generation_runs_application_pack_id"), "generation_runs", ["application_pack_id"], unique=False)
    op.create_index(op.f("ix_generation_runs_source_resume_id"), "generation_runs", ["source_resume_id"], unique=False)
    op.create_index(op.f("ix_generation_runs_tailored_resume_id"), "generation_runs", ["tailored_resume_id"], unique=False)
    op.create_index(op.f("ix_generation_runs_job_id"), "generation_runs", ["job_id"], unique=False)
    op.create_index(op.f("ix_generation_runs_run_kind"), "generation_runs", ["run_kind"], unique=False)
    op.create_table(
        "artifacts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("artifact_id", sa.String(length=64), nullable=False),
        sa.Column("application_pack_id", sa.String(length=64), nullable=True),
        sa.Column("generation_run_id", sa.String(length=64), nullable=True),
        sa.Column("resume_id", sa.String(length=64), nullable=True),
        sa.Column("kind", sa.String(length=64), nullable=False),
        sa.Column("mime_type", sa.String(length=128), nullable=False),
        sa.Column("file_name", sa.String(length=255), nullable=False),
        sa.Column("storage_path", sa.Text(), nullable=False),
        sa.Column("metadata", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("artifact_id"),
    )
    op.create_index(op.f("ix_artifacts_artifact_id"), "artifacts", ["artifact_id"], unique=True)
    op.create_index(op.f("ix_artifacts_application_pack_id"), "artifacts", ["application_pack_id"], unique=False)
    op.create_index(op.f("ix_artifacts_generation_run_id"), "artifacts", ["generation_run_id"], unique=False)
    op.create_index(op.f("ix_artifacts_resume_id"), "artifacts", ["resume_id"], unique=False)
    op.create_index(op.f("ix_artifacts_kind"), "artifacts", ["kind"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_artifacts_kind"), table_name="artifacts")
    op.drop_index(op.f("ix_artifacts_resume_id"), table_name="artifacts")
    op.drop_index(op.f("ix_artifacts_generation_run_id"), table_name="artifacts")
    op.drop_index(op.f("ix_artifacts_application_pack_id"), table_name="artifacts")
    op.drop_index(op.f("ix_artifacts_artifact_id"), table_name="artifacts")
    op.drop_table("artifacts")
    op.drop_index(op.f("ix_generation_runs_run_kind"), table_name="generation_runs")
    op.drop_index(op.f("ix_generation_runs_job_id"), table_name="generation_runs")
    op.drop_index(op.f("ix_generation_runs_tailored_resume_id"), table_name="generation_runs")
    op.drop_index(op.f("ix_generation_runs_source_resume_id"), table_name="generation_runs")
    op.drop_index(op.f("ix_generation_runs_application_pack_id"), table_name="generation_runs")
    op.drop_index(op.f("ix_generation_runs_generation_run_id"), table_name="generation_runs")
    op.drop_table("generation_runs")
    op.drop_index(op.f("ix_jobs_resume_id"), table_name="jobs")
    op.drop_index(op.f("ix_jobs_job_id"), table_name="jobs")
    op.drop_table("jobs")
    op.drop_index(op.f("ix_resumes_application_pack_id"), table_name="resumes")
    op.drop_index(op.f("ix_resumes_parent_id"), table_name="resumes")
    op.drop_index(op.f("ix_resumes_is_master"), table_name="resumes")
    op.drop_index(op.f("ix_resumes_resume_id"), table_name="resumes")
    op.drop_table("resumes")
    op.drop_index(op.f("ix_application_packs_pack_id"), table_name="application_packs")
    op.drop_table("application_packs")
    op.drop_table("users")
