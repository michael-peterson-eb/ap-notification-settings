import Field from 'components/Field';
import { Input } from 'components/input';
import { Button } from 'components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from 'components/ui/dialog';

import type { FormState } from './types';

type SettingsModalProps = {
  open: boolean;
  loading: boolean;
  form: FormState;
  onOpenChange: (open: boolean) => void;
  onFieldChange: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  onSave: () => Promise<void> | void;
};

export function SettingsModal({ open, loading, form, onOpenChange, onFieldChange, onSave }: SettingsModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Everbridge Settings</DialogTitle>
          <DialogDescription>Credentials are stored in settings and used before the templates table loads.</DialogDescription>
        </DialogHeader>

        <form
          className="space-y-6"
          onSubmit={(event) => {
            event.preventDefault();
            onSave();
          }}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Client ID" required>
              <Input value={form.eb_client_id} onChange={(e) => onFieldChange('eb_client_id', e.target.value)} placeholder="Client ID" />
            </Field>

            <Field label="Client Secret">
              <Input
                type="password"
                value={form.eb_client_secret}
                onChange={(e) => onFieldChange('eb_client_secret', e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
              />
            </Field>

            <Field label="Username" required>
              <Input value={form.eb_username} onChange={(e) => onFieldChange('eb_username', e.target.value)} placeholder="Username" autoComplete="username" />
            </Field>

            <Field label="Password">
              <Input
                type="password"
                value={form.eb_user_password}
                onChange={(e) => onFieldChange('eb_user_password', e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
              />
            </Field>

            <Field label="Role ID" required>
              <Input value={form.eb_role_id} onChange={(e) => onFieldChange('eb_role_id', e.target.value)} placeholder="Role ID" />
            </Field>
          </div>

          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancel
            </Button>

            <Button type="submit" disabled={loading}>
              {loading ? 'Saving...' : 'Save Settings'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
