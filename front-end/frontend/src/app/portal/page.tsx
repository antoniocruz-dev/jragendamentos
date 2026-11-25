import { redirect } from 'next/navigation';

/** O antigo Portal do Cliente agora é a Área do Cliente. */
export default function PortalRedirect() {
  redirect('/cliente');
}
