import { createTheme } from '@mui/material';

export const customTheme = createTheme({
  typography: {
    fontSize: 16,
  },
  status: {
    danger: '#e53e3e',
  },
  palette: {
    primary: {
      main: '#0042B6',
    },
    active: {
      main: '#0572ed',
    },
    completed: {
      main: '#0FC27D',
    },
    submit: {
      main: '#ef5b18',
    },
    action: {
      disabled: 'rgba(0, 0, 0, 0.60)',
    },
    text: {
      disabled: 'rgba(0, 0, 0, 0.60)',
    },
  },
  components: {
    MuiInputLabel: {
      defaultProps: {
        sx: {
          fontSize: 16,
        },
      },
    },
    MuiOutlinedInput: {
      defaultProps: {
        sx: {
          fontSize: 16,
        },
      },
    },
    MuiSelect: {
      defaultProps: {
        sx: {
          fontSize: 16,
        },
      },
    },
    MuiInputBase: {
      defaultProps: {
        sx: {
          fontSize: 16,
        },
      },
    },
    MuiTextField: {
      defaultProps: {
        sx: {
          fontSize: 16,
        },
      },
    },
  },
});
