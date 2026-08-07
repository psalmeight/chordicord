import { Box, Button, Container, Flex, HStack, Text } from '@chakra-ui/react';
import { ListMusic, LogOut, Music, Users as UsersIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useApp } from '@/contexts/AppContext';
import { MetronomeProvider } from '@/contexts/MetronomeContext';
import ChartSyntaxGuide from '@/components/ChartSyntaxGuide';
import { FONTS } from '@/lib/fonts';

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout, font, setFont } = useApp();
  const { pathname } = useLocation();

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
              {user?.role === 'admin' &&
                navItem('/users', 'Team', <UsersIcon size={16} />, pathname.startsWith('/users'))}
            </HStack>

            <HStack gap={3}>
              <select
                value={font.id}
                onChange={(e) => setFont(e.target.value)}
                aria-label="Chart font"
                title="Font used for chord charts"
                style={{
                  padding: '5px 8px',
                  borderRadius: 6,
                  border: '1px solid rgba(248, 246, 242, 0.28)',
                  background: 'transparent',
                  color: 'var(--bg)',
                  fontSize: 13,
                  fontFamily: 'inherit',
                }}
              >
                {FONTS.map((f) => (
                  <option key={f.id} value={f.id} style={{ color: 'var(--ink)' }}>
                    {f.label}
                  </option>
                ))}
              </select>
              <Text
                fontSize="sm"
                color="rgba(248, 246, 242, 0.72)"
                display={{ base: 'none', md: 'block' }}
              >
                {user?.name}
              </Text>
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

      <Container maxW="6xl" py={6}>
        {children}
      </Container>

      {/* Mounted app-wide, beside the metronome: the format is worth looking up
          while reading a chart someone else wrote, not only while writing one. */}
      <ChartSyntaxGuide />
    </Box>
    </MetronomeProvider>
  );
}
