# Emergency Aid - Medical Emergency Response System

A comprehensive role-based emergency medical response application with Patient, Hospital, and Driver dashboards.

## ✅ Project Status

- ✅ Frontend UI - Complete (All 4 pages)
- ✅ Authentication Context - Complete
- ✅ Patient Dashboard - Complete with SOS button
- ✅ Hospital Dashboard - Complete with case management
- ✅ Driver Dashboard - Complete with navigation
- ✅ TypeScript Configuration - Complete
- ✅ Tailwind CSS Integration - Complete
- ⏳ Backend API Integration - Pending
- ⏳ Maps Integration - Pending
- ⏳ Real-time WebSocket - Pending

## 🏗️ Architecture

### Pages & Routes
- `/` - Home (redirects to /login)
- `/login` - Authentication page with role selection
- `/patient` - Patient SOS dashboard with smart sidebar
- `/hospital` - Hospital command center
- `/driver` - Ambulance driver navigation dashboard

### State Management
- `AuthContext` - User authentication and role management
- localStorage - Persistent session storage

### Key Features by Role

#### 👥 Patient Dashboard
- Red SOS button with 3-second hold animation
- Circular progress indicator
- Location auto-sharing
- Smart sidebar with:
  - Medical document upload
  - Symptom input with PDF conversion
  - Live ambulance ETA
  - Emergency contact notification

#### 🏢 Hospital Dashboard
- Emergency case feed with live updates
- Priority-based case filtering
- Bed availability management
- Secure patient details modal
- PDF viewer with auto-delete timer
- Map integration for case location

#### 🚗 Driver Dashboard
- Mobile-optimized navigation interface
- Full-screen map with route display
- Real-time distance/duration tracking
- Patient details card
- Pre-arrival checklist
- Patient handover confirmation

## 🚀 Getting Started

### Installation
```bash
npm install
npm run dev
```

### Demo Access
- **Email**: demo@medical.com
- **Password**: 123456
- Try all roles: Patient, Hospital, Driver

## 📁 Project Structure

```
medical-emergency-app/
├── src/
│   ├── app/
│   │   ├── globals.css              # Global styles
│   │   ├── layout.tsx               # Root layout with AuthProvider
│   │   ├── page.tsx                 # Home redirect
│   │   ├── login/page.tsx           # Login with role selection
│   │   ├── patient/page.tsx         # Patient SOS dashboard
│   │   ├── hospital/page.tsx        # Hospital command center
│   │   └── driver/page.tsx          # Driver navigation dashboard
│   ├── context/
│   │   └── AuthContext.tsx          # Auth state & hooks
│   ├── components/                  # Reusable components (future)
│   └── lib/
│       └── apiConfig.ts             # API configuration
├── public/                          # Static assets
├── package.json                     # Dependencies & scripts
├── tsconfig.json                    # TypeScript config
├── tailwind.config.ts               # Tailwind configuration
├── next.config.ts                   # Next.js configuration
├── README.md                        # Full documentation
└── .github/copilot-instructions.md  # This file
```

## 🔧 Technology Stack

- **Next.js 15** - React framework
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **React Context API** - State management
- **zustand** - Additional state management
- **axios** - HTTP requests
- **PostCSS & Autoprefixer** - CSS processing

## 🎨 Design System

### Colors
- **Primary Blue**: #2563eb
- **Danger Red**: #ef4444
- **Success Green**: #10b981
- **Warning Yellow**: #f59e0b

### Responsive Breakpoints
- Mobile: < 640px
- Tablet: 640px - 1024px
- Desktop: > 1024px

## 🔐 Authentication Flow

1. User visits `/login`
2. Selects role (Patient/Hospital/Driver)
3. Enters credentials
4. Context updates and stores in localStorage
5. Redirects to role-specific dashboard
6. Logout clears session

## 📡 API Integration Points

Ready to connect to backend:

```typescript
// Patient endpoints
POST /api/patient/sos - Trigger emergency
GET /api/patient/eta - Get ambulance ETA
POST /api/patient/documents - Upload medical records

// Hospital endpoints
GET /api/hospital/emergencies - List active cases
GET /api/hospital/case/:id - Case details
POST /api/hospital/case/:id/accept - Accept case
GET /api/hospital/patient/:id/pdf - Get medical PDF

// Driver endpoints
GET /api/driver/assignment - Get patient assignment
POST /api/driver/location - Update driver location
POST /api/driver/handover - Complete handover
```

## 🛠️ Development Guidelines

### Adding New Features
1. Create component in `src/components/`
2. Update relevant dashboard page
3. Add TypeScript interfaces
4. Test across all devices
5. Update documentation

### Styling Standards
- Use Tailwind CSS utility classes
- Mobile-first responsive design
- Consistent with medical theme colors
- Accessible WCAG 2.1 AA

### State Management
- Use AuthContext for user data
- Consider zustand for complex features
- Keep localStorage for persistence
- Avoid prop drilling

## 🚨 Important Notes

### Security Considerations
- PDF viewer disables right-click (future)
- Medical records auto-delete after 5:30 min
- Sensitive data not permanently stored
- Role-based access control enforced

### Browser Support
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

### Performance
- Code splitting via Next.js
- Optimized images and fonts
- Lazy loading for maps (future)
- Real-time updates via WebSocket (future)

## 📋 Deployment Checklist

- [ ] Environment variables configured
- [ ] Backend API endpoints updated
- [ ] Maps API key added
- [ ] Database connected
- [ ] CORS properly configured
- [ ] Security headers set
- [ ] Error tracking enabled (Sentry/etc)
- [ ] Analytics configured
- [ ] SSL certificate valid

## 🐛 Known Issues & Limitations

1. **Maps**: Currently simulated - needs Google Maps API
2. **Real-time**: Uses setInterval - needs WebSocket for production
3. **PDF Viewer**: Placeholder - needs react-pdf backend integration
4. **Authentication**: Simulated - needs backend authentication
5. **Voice Input**: Not yet implemented

## 📈 Roadmap

### Phase 1 (Current) ✅
- Frontend UI implementation
- Authentication context
- Dashboard layouts

### Phase 2 (Next)
- Backend API integration
- Real database (MongoDB)
- Real maps integration
- WebSocket for real-time

### Phase 3 (Future)
- Mobile app (React Native)
- Voice/video calling
- Machine learning features
- Advanced analytics
- Multi-language support

## 🤝 Contribution Guidelines

1. Follow TypeScript strict mode
2. Use Tailwind for styling
3. Keep components small and focused
4. Add JSDoc comments
5. Test responsive design
6. Update documentation

## 📚 Resources

- [Next.js Docs](https://nextjs.org/docs)
- [Tailwind CSS](https://tailwindcss.com/docs)
- [TypeScript](https://www.typescriptlang.org/docs)
- [React Context](https://react.dev/reference/react/useContext)

## 🆘 Emergency Contacts (Real-world)

For actual medical emergencies: **Call 911**
- Police: 911
- Fire: 911
- Medical: 911

---

**Last Updated**: December 21, 2025
**Maintainer**: Development Team
**Status**: MVP Complete - Ready for Backend Integration
