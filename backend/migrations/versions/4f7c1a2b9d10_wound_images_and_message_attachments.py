"""wound_images table + message attachments + helpful indexes

Revision ID: 4f7c1a2b9d10
Revises: 2df9874a61a9
Create Date: 2026-05-27 13:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '4f7c1a2b9d10'
down_revision = '2df9874a61a9'
branch_labels = None
depends_on = None


def upgrade():
    # --- wound_images (HU1) ---
    op.create_table(
        'wound_images',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('patient_id', sa.Integer(), nullable=False),
        sa.Column('storage_path', sa.String(length=500), nullable=False),
        sa.Column('mime_type', sa.String(length=50), nullable=False),
        sa.Column('size_bytes', sa.Integer(), nullable=False),
        sa.Column('original_name', sa.String(length=255), nullable=True),
        sa.Column('uploaded_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['patient_id'], ['patients.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    with op.batch_alter_table('wound_images', schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f('ix_wound_images_patient_id'), ['patient_id'], unique=False,
        )
        batch_op.create_index(
            batch_op.f('ix_wound_images_uploaded_at'), ['uploaded_at'], unique=False,
        )

    # --- messages.attachment_* + index ---
    with op.batch_alter_table('messages', schema=None) as batch_op:
        batch_op.add_column(sa.Column('attachment_type', sa.String(length=30), nullable=True))
        batch_op.add_column(sa.Column('attachment_id', sa.Integer(), nullable=True))
        batch_op.create_index(
            batch_op.f('ix_messages_patient_id'), ['patient_id'], unique=False,
        )
        batch_op.create_index(
            batch_op.f('ix_messages_created_at'), ['created_at'], unique=False,
        )


def downgrade():
    with op.batch_alter_table('messages', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_messages_created_at'))
        batch_op.drop_index(batch_op.f('ix_messages_patient_id'))
        batch_op.drop_column('attachment_id')
        batch_op.drop_column('attachment_type')

    with op.batch_alter_table('wound_images', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_wound_images_uploaded_at'))
        batch_op.drop_index(batch_op.f('ix_wound_images_patient_id'))

    op.drop_table('wound_images')
