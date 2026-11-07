import { useParams } from 'react-router-dom';
import { PersonDetail } from '../../components/people/PersonDetail';

export default function PlayerDetailPage() {
  const { id = '' } = useParams();
  return <PersonDetail kind="player" id={id} />;
}
