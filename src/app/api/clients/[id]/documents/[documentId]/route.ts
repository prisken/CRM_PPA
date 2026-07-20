import { NextResponse } from 'next/server';
import {
  getClientOr404,
  logClientSystemEvent,
  requireSuperAdmin,
} from '@/lib/authHelpers';
import { prisma } from '@/lib/prisma';
import {
  CLIENT_DOCUMENTS_BUCKET,
  createSupabaseAdminClient,
} from '@/lib/supabaseAdmin';

function getStoragePathFromUrl(url: string) {
  const marker = `/storage/v1/object/public/${CLIENT_DOCUMENTS_BUCKET}/`;
  const index = url.indexOf(marker);
  if (index === -1) {
    return null;
  }

  return decodeURIComponent(url.slice(index + marker.length));
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; documentId: string }> }
) {
  const { id: clientId, documentId } = await params;
  const auth = await requireSuperAdmin(request);
  if (auth.error) {
    return auth.error;
  }

  const clientCheck = await getClientOr404(clientId);
  if (clientCheck.error) {
    return clientCheck.error;
  }

  const document = await prisma.clientDocument.findUnique({
    where: { id: documentId },
  });

  if (!document || document.clientId !== clientId) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }

  const storagePath = getStoragePathFromUrl(document.url);
  if (storagePath) {
    const supabase = createSupabaseAdminClient();
    const { error: storageError } = await supabase.storage
      .from(CLIENT_DOCUMENTS_BUCKET)
      .remove([storagePath]);

    if (storageError) {
      return NextResponse.json(
        { error: `Failed to delete file: ${storageError.message}` },
        { status: 500 }
      );
    }
  }

  await prisma.clientDocument.delete({
    where: { id: documentId },
  });

  await logClientSystemEvent(
    clientId,
    `Document deleted: ${document.fileName}`,
    auth.user.id
  );

  return NextResponse.json({ success: true });
}
