import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Settings from './pages/Settings';
import { ToastProvider } from 'hooks/useToasts';

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <Settings />
      </ToastProvider>
    </QueryClientProvider>
  );
}
