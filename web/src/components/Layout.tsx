import { Box, Button, Container, Flex, HStack, Text } from '@chakra-ui/react';
import { ListMusic, LogOut, Music, Users as UsersIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useApp } from '@/contexts/AppContext';
import { MetronomeProvider } from '@/contexts/MetronomeContext';
import { FONTS } from '@/lib/fonts';

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout, font, setFont } = useApp();
  const { pathname } = useLocation();

  const navItem = (to: string, label: string, icon: ReactNode, active: boolean) => (
    <Link to={to}>
      <Button size="sm" variant={active ? 'subtle' : 'ghost'}>
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
      <Box as="header" bg="white" borderBottomWidth="1px" className="no-print">
        <Container maxW="6xl" py={3}>
          <Flex align="center" justify="space-between">
            <HStack gap={1}>
              <Link to="/">
                <Text fontWeight="bold" fontSize="lg" mr={4}>
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
                  border: '1px solid #CBD5E0',
                  fontSize: 13,
                  fontFamily: 'inherit',
                }}
              >
                {FONTS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
              <Text fontSize="sm" color="gray.600" display={{ base: 'none', md: 'block' }}>
                {user?.name}
              </Text>
              <Button size="sm" variant="ghost" onClick={logout} aria-label="Log out">
                <LogOut size={16} />
              </Button>
            </HStack>
          </Flex>
        </Container>
      </Box>

      <Container maxW="6xl" py={6}>
        {children}
      </Container>
    </Box>
    </MetronomeProvider>
  );
}
