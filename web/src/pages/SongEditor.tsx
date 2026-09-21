import { Button, Text } from '@chakra-ui/react';
import { ArrowLeft } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import SongForm from '@/components/SongForm';

/** The /songs/new and /songs/:id/edit page. The form itself is SongForm,
 *  shared with the setlist's edit-from-songbank modal; this page only adds
 *  the Back link and where to go after saving or archiving. */
export default function SongEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id;

  return (
    <SongForm
      songId={id}
      heading={isNew ? 'New song' : 'Edit song'}
      leading={
        <Link to={isNew ? '/' : `/songs/${id}`}>
          <Button size="sm" variant="ghost">
            <ArrowLeft size={16} />
            <Text ml={1}>Back</Text>
          </Button>
        </Link>
      }
      onSaved={(song) => navigate(`/songs/${song.id}`, { replace: isNew })}
      onArchived={() => navigate('/', { replace: true })}
    />
  );
}
