import { RegistrationForm } from '../../components/people/RegistrationForm';

/** /app/players/new registers a player; /app/players/new?id=<playerId> resumes or edits one. */
export default function PlayerFormPage() {
  return <RegistrationForm kind="player" />;
}
