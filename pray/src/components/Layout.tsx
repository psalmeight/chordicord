import { Box, Button, Container, Flex, HStack, Text } from '@chakra-ui/react';
import { HandHeart, LogOut, Tags } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useApp } from '@/contexts/AppContext';
import { canManage } from '@/lib/auth';

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useApp();
  const { pathname } = useLocation();

  /* Dark navy header, as in the songbook: nav buttons carry their own
     light-on-dark colours. */
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
    <Box minH="100vh" bg="gray.50">
      <Box as="header" bg="gray.950" borderBottomWidth="3px" borderColor="brand.600">
        <Container maxW="4xl" py={3}>
          <Flex align="center" justify="space-between">
            <HStack gap={1}>
              <Link to="/">
                <Text fontWeight="bold" fontSize="lg" mr={4} color="gray.50">
                  FCF Prayer
                </Text>
              </Link>
              {navItem('/', 'Prayers', <HandHeart size={16} />, pathname === '/')}
              {canManage(user) &&
                navItem('/categories', 'Categories', <Tags size={16} />, pathname.startsWith('/categories'))}
            </HStack>

            <HStack gap={3}>
              <Text fontSize="sm" color="rgba(248, 246, 242, 0.72)" display={{ base: 'none', md: 'block' }}>
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

      <Container maxW="4xl" py={6}>
        {children}
      </Container>
    </Box>
  );
}
