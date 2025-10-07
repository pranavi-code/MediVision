# MediVision Frontend

A modern React frontend for the MediVision medical AI platform, providing an intuitive interface for chest X-ray diagnosis and analysis.

## Features

- **Modern UI/UX**: Built with React, TypeScript, and Tailwind CSS
- **Responsive Design**: Works seamlessly on desktop, tablet, and mobile
- **Dark/Light Theme**: Toggle between themes for optimal viewing
- **Medical AI Integration**: Direct integration with MedRAX backend
- **Landing Page**: Professional landing page showcasing features
- **Authentication**: Login and signup pages (ready for backend integration)

## Quick Start

### Prerequisites

- Node.js 18+ 
- npm or yarn
- MedRAX backend running (see parent directory)

### Installation

1. Navigate to the frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

4. Open your browser to `http://localhost:8080`

## Project Structure

```
frontend/
├── src/
│   ├── components/
│   │   └── ui/              # Reusable UI components
│   ├── pages/               # Page components
│   │   ├── Landing.tsx      # Main landing page
│   │   ├── Login.tsx        # Login page
│   │   ├── Signup.tsx       # Registration page
│   │   └── NotFound.tsx     # 404 page
│   ├── lib/                 # Utility functions
│   ├── App.tsx              # Main app component
│   ├── main.tsx             # Entry point
│   └── index.css            # Global styles
├── public/                  # Static assets
├── package.json
├── tailwind.config.ts       # Tailwind configuration
├── vite.config.ts           # Vite configuration
└── tsconfig.json            # TypeScript configuration
```

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

## Integration with MedRAX

The frontend is designed to work seamlessly with the MedRAX backend:

- **Landing Page**: Provides overview and direct access to MedRAX interface
- **Demo Integration**: "Start Diagnosing" buttons link to `http://127.0.0.1:7860`
- **Future API Integration**: Authentication and user management ready for backend APIs

## Customization

### Theming

Colors, fonts, and animations are defined in `src/index.css` using CSS custom properties. Modify the `:root` and `.dark` selectors to customize the theme.

### Components

UI components are built with Radix UI primitives and styled with Tailwind CSS. They're located in `src/components/ui/` and can be easily customized.

### Pages

Page components are in `src/pages/` and use React Router for navigation. Add new pages by creating components and updating `App.tsx`.

## Deployment

### Development
```bash
npm run dev
```

### Production
```bash
npm run build
npm run preview
```

The built files will be in the `dist/` directory, ready for deployment to any static hosting service.

## Technology Stack

- **React 18** - UI library
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server  
- **Tailwind CSS** - Styling framework
- **Radix UI** - Accessible component primitives
- **Lucide React** - Icon library
- **React Router** - Client-side routing

## Contributing

1. Follow the existing code style and component patterns
2. Use TypeScript for type safety
3. Follow Tailwind CSS conventions for styling
4. Test components across different screen sizes
5. Ensure accessibility compliance

## License

This project is part of the MediVision platform for medical AI diagnosis.