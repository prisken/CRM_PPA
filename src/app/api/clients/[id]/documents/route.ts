import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import {
  getClientOr404,
  logClientSystemEvent,
  requireSuperAdminOrClientAccess,
} from '@/lib/authHelpers';
import { prisma } from '@/lib/prisma';
import {
  CLIENT_DOCUMENTS_BUCKET,
  createSupabaseAdminClient,
} from '@/lib/supabaseAdmin';

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
]);

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: clientId } = await params;
  const auth = await requireSuperAdminOrClientAccess(clientId, request);
  if (auth.error) {
    return auth.error;
  }

  const clientCheck = await getClientOr404(clientId);
  if (clientCheck.error) {
    return clientCheck.error;
  }

  const formData = await request.formData();
  const file = formData.get('file');

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'A file is required' }, { status: 400 });
  }

  if (file.size === 0) {
    return NextResponse.json({ error: 'File cannot be empty' }, { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json(
      { error: 'File exceeds the 10MB upload limit' },
      { status: 400 }
    );
  }

  if (file.type && !ALLOWED_MIME_TYPES.has(file.type)) {
    return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 });
  }

  const safeFileName = sanitizeFileName(file.name || 'upload');
  const storagePath = `${clientId}/${randomUUID()}-${safeFileName}`;
  const fileBuffer = Buffer.from(await file.arrayBuffer());

  const supabase = createSupabaseAdminClient();
  const { error: uploadError } = await supabase.storage
    .from(CLIENT_DOCUMENTS_BUCKET)
    .upload(storagePath, fileBuffer, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json(
      { error: `Failed to upload file: ${uploadError.message}` },
      { status: 500 }
    );
  }

  const { data: publicUrlData } = supabase.storage
    .from(CLIENT_DOCUMENTS_BUCKET)
    .getPublicUrl(storagePath);

  const document = await prisma.clientDocument.create({
    data: {
      clientId,
      fileName: file.name || safeFileName,
      url: publicUrlData.publicUrl,
    },
  });

  await logClientSystemEvent(
    clientId,
    `Document uploaded: ${document.fileName}`,
    auth.user.id
  );

  return NextResponse.json(
    {
      id: document.id,
      fileName: document.fileName,
      downloadUrl: document.url,
      uploadedAt: document.uploadedAt.toISOString(),
    },
    { status: 201 }
  );
}
