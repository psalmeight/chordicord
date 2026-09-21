import { Toaster as ChakraToaster, Portal, Stack, Toast, createToaster } from '@chakra-ui/react';

/** The app's one toast queue. Top-centre, out of the way of the floating
 *  widgets and the editor's action bar, which own the bottom edge. */
export const toaster = createToaster({ placement: 'top', pauseOnPageIdle: true });

/** Mounted once, in Layout. Rendered small: a toast here is a nod ("Saved"),
 *  not a notice to read. */
export function Toaster() {
  return (
    <Portal>
      <ChakraToaster toaster={toaster} insetInline={{ mdDown: '4' }}>
        {(toast) => (
          <Toast.Root width="auto" minW="0" py={2} px={3}>
            <Toast.Indicator />
            <Stack gap="0" flex="1" maxWidth="100%">
              {toast.title && <Toast.Title fontSize="sm">{toast.title}</Toast.Title>}
              {toast.description && (
                <Toast.Description fontSize="xs">{toast.description}</Toast.Description>
              )}
            </Stack>
            {toast.closable && <Toast.CloseTrigger />}
          </Toast.Root>
        )}
      </ChakraToaster>
    </Portal>
  );
}

const AUTOSAVE_ID = 'autosave';

/** The autosave nod. One toast, updated in place, so a burst of saves shows
 *  one "Saved" rather than a stack of them. */
export function toastSaved() {
  const opts = { title: 'Saved', type: 'success', duration: 1500 } as const;
  if (toaster.isVisible(AUTOSAVE_ID)) toaster.update(AUTOSAVE_ID, opts);
  else toaster.create({ id: AUTOSAVE_ID, ...opts });
}

export function toastSaveFailed(message: string) {
  const opts = { title: "Couldn't save", description: message, type: 'error', duration: 5000 } as const;
  if (toaster.isVisible(AUTOSAVE_ID)) toaster.update(AUTOSAVE_ID, opts);
  else toaster.create({ id: AUTOSAVE_ID, ...opts });
}
