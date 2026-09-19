import { Box, Button, Container, Flex, HStack, Text } from '@chakra-ui/react';
import { Archive, ListMusic, LogOut, Music, Users as UsersIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useApp } from '@/contexts/AppContext';
import { canEdit } from '@/lib/auth';
import { MetronomeProvider } from '@/contexts/MetronomeContext';
import ChartSyntaxGuide from '@/components/ChartSyntaxGuide';
import DisplaySettings from '@/components/DisplaySettings';
import ChartV2Guide from '@/components/ChartV2Guide';
import { Toaster } from '@/components/Toaster';
import { useEditorV2 } from '@/lib/useEditorV2';
import { AUTOSCROLL_CONTENT_ID } from '@/lib/useAutoScroll';

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useApp();
  const { pathname } = useLocation();
  // Which chart format the guide in the corner should describe.
  const [v2] = useEditorV2();

  /* The header runs on the site's dark navy, so nav buttons carry their own
     light-on-dark colours rather than the default fg-on-paper ones. */
  const navItem = (to: string, label: string, icon: ReactNode, active: boolean) => (
    <Link to={to}>
      <Button
        size="sm"
        variant="ghost"
        color={active ? 'gray.50' : 'rgba(248, 246, 242, 0.72)'}
        bg={active ? 'rgba(248, 246, 242, 0.12)' : 'transparent'}
        _hover={{ bg: 'rgba(248, 246, 242, 0.16)', color: 'gray.50' }}
      >
        {icon}
        <Text ml={2} display={{ base: 'none', sm: 'inline' }}>
          {label}
        </Text>
      </Button>
    </Link>
  );

  return (
    <MetronomeProvider>
    <Box minH="100vh" bg="gray.50">
      <Box
        as="header"
        bg="gray.950"
        borderBottomWidth="3px"
        borderColor="brand.600"
        className="no-print"
      >
        <Container maxW="6xl" py={3}>
          <Flex align="center" justify="space-between">
            <HStack gap={1}>
              <Link to="/">
                <Text fontWeight="bold" fontSize="lg" mr={4} color="gray.50">
                  FCF Chords
                </Text>
              </Link>
              {navItem('/', 'Songs', <Music size={16} />, pathname === '/' || pathname.startsWith('/songs'))}
              {navItem('/setlists', 'Setlists', <ListMusic size={16} />, pathname.startsWith('/setlists'))}
              {canEdit(user) &&
                navItem('/archive', 'Archive', <Archive size={16} />, pathname.startsWith('/archive'))}
              {user?.role === 'admin' &&
                navItem('/users', 'Team', <UsersIcon size={16} />, pathname.startsWith('/users'))}
            </HStack>

            <HStack gap={3}>
              <Text
                fontSize="sm"
                color="rgba(248, 246, 242, 0.72)"
                display={{ base: 'none', md: 'block' }}
              >
                {user?.name}
              </Text>
              {/* Chart format, size and font — one popover, every chart. */}
              <DisplaySettings />
              <Button
                size="sm"
                variant="ghost"
                onClick={logout}
                aria-label="Log out"
                color="rgba(248, 246, 242, 0.72)"
                _hover={{ bg: 'rgba(248, 246, 242, 0.16)', color: 'gray.50' }}
              >
                <LogOut size={16} />
              </Button>
            </HStack>
          </Flex>
        </Container>
      </Box>

      {/* Auto-scroll nudges this wrapper by a sub-pixel translate while it
          runs; the floating widgets sit outside it so they stay fixed. */}
      <Container maxW="6xl" py={6} id={AUTOSCROLL_CONTENT_ID}>
        {children}
      </Container>

      {/* The chart-writing guide, for whichever format this device is using.
          Mounted app-wide but shows itself only while a song is being edited. */}
      {v2 ? <ChartV2Guide /> : <ChartSyntaxGuide />}
      <Toaster />
    </Box>
    </MetronomeProvider>
  );
}
