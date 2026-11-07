import { EmptyState, LinkButton } from '../components/ui';
import { useAuth } from '../lib/auth';

export default function NotFoundPage() {
  const { appUser } = useAuth();
  return (
    <EmptyState page title="Page not found" description="That address does not lead anywhere. The link may be old or mistyped."
      action={<LinkButton to={appUser ? '/app' : '/'}>{appUser ? 'Go to your home page' : 'Go to the home page'}</LinkButton>} />
  );
}
