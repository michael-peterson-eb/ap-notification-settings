import type { Control, FieldValues } from 'react-hook-form';

export type CrudAction = 'view' | 'edit';

export type AppParams = {
  crudAction: CrudAction;
};

export type CellChangeEvent = {
  target: {
    id: string;
    name: string;
    value: string;
  };
};

export interface FormInputProps {
  rowId: string;
  fieldName: string;
  appParams: AppParams;
  control: Control<FieldValues>;
  value?: string;
  label?: string;
  required?: boolean;
  handleChange: (event: CellChangeEvent, dataObj?: any, extraFields?: any) => void;
  hasLabel?: boolean;
}
