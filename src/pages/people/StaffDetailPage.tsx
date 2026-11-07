import { useParams } from 'react-router-dom';
import { PersonDetail } from '../../components/people/PersonDetail';

export default function StaffDetailPage() {
  const { id = '' } = useParams();
  return <PersonDetail kind="staff" id={id} />;
}
