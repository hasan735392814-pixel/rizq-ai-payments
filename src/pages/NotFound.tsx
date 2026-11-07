import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';

export function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-navy-50 px-6">
      <div className="w-full max-w-md rounded-2xl border border-navy-100 bg-white shadow-card">
        <EmptyState
          icon={Compass}
          title="This page does not exist"
          description="The link may be out of date, or the page was moved. Head back to your dashboard to keep going."
          action={
            <Link to="/dashboard">
              <Button variant="accent">Go to dashboard</Button>
            </Link>
          }
        />
      </div>
    </div>
  );
}
