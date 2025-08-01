import { createBrowserRouter, RouterProvider, Navigate, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { LoginPage } from "@/pages/LoginPage";
import { AppLayout } from '@/components/layout/AppLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { LeaderLayout } from "@/components/layout/LeaderLayout";
import { UserLayout } from "@/components/layout/UserLayout";
import { AdminGroupListPage } from '@/pages/admin/AdminGroupListPage';
import { GroupDashboardLayout } from '@/components/layout/GroupDashboardLayout';
import { AdminRepertoireListPage } from '@/pages/admin/AdminRepertoireListPage';
import { AdminUploadMaterialPage } from '@/pages/admin/AdminUploadMaterialPage';
import { AdminUploadPracticePage } from '@/pages/admin/AdminUploadPracticePage';
import { AdminUserManagementPage } from "@/pages/admin/AdminUserManagementPage";
import { RegistrationPage } from "@/pages/RegistrationPage";
import { AdminEventPage } from "@/pages/admin/AdminEventPage";
import { MemberDashboard } from "@/pages/member/MemberDashboard";
import { LeaderDashboard } from "@/pages/leader/LeaderDashboard";
import { MemberListRepertoirePage } from "@/pages/member/MemberListRepertoirePage";
import { MemberRepertoireMaterialPage } from "@/pages/member/MemberRepertoireMaterialPage";
import { MemberEventPage } from "@/pages/member/MemberEventPage";
import { AdminRepertoireMaterialPage } from "@/pages/admin/AdminRepertoireMaterialPage";
import { PracticePage } from "@/pages/PracticePage";
import { LeaderAttendancePage } from "@/pages/leader/LeaderAttendancePage";
import { Outlet } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { GroupSelectionPage } from '@/pages/GroupSelectionPage';
import { MaterialDetailPage } from "@/pages/admin/MaterialDetailPage";
import { PublicChoirListPage } from "@/pages/PublicChoirListPage";

// Denna komponent ersätter din gamla DashboardPage.
// Dess enda syfte är att omedelbart dirigera användaren till rätt plats.
const DashboardPage = () => {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // Vänta tills vi vet vem användaren är
    if (isLoading || !user) return;

    // Dirigera baserat på roll
    if (user.role === 'admin') {
      navigate('/admin/groups', { replace: true });
    } 
    else if (user.role === 'leader' || user.role === 'user') {
      // För både leader och user, kolla antalet grupper
      if (user.groups && user.groups.length === 1) {
        const groupSlug = user.groups[0];
        // För leader, gå till den specifika gruppens dashboard
        // För user, gå till deras dashboard med den specifika gruppens slug
        const destination = user.role === 'leader' ? `/leader/choir/${groupSlug}` : `/user/me/${groupSlug}`;
        navigate(destination, { replace: true });
      } else {
        // För 0 eller 2+ grupper, gå till urvalssidan
        navigate('/select-group', { replace: true });
      }
    }
  }, [user, isLoading, navigate]);

  // Visa en enkel laddningsindikator medan logiken körs
  return <div>Laddar...</div>;
};


const router = createBrowserRouter([
  {
    path: "/login",
    element: <LoginPage />,
  },
  {
    path: "/register",
    element: <RegistrationPage />,
  },
  {
    path: "/",
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppLayout />,
        children: [
          {
            index: true,
            element: <DashboardPage />,
          },
          {
            path: "select-group",
            element: <GroupSelectionPage />,
          },
           {
            path: "choirs",
            element: <PublicChoirListPage />,
          },
          {
            path: "admin",
            element: <AdminLayout />,
            children: [
              {
                path: "globalMaterial",
                element: <AdminUploadMaterialPage />,
              },
               {
                path: "globalMaterial/:folderPath",
                element: <MaterialDetailPage />,
              },
              {
                path: "practice",
                element: <AdminUploadPracticePage />,
              },
              {
                path: "groups",
                element: <AdminGroupListPage />,
              },
              {
                path: "groups/:groupName",
                element: <GroupDashboardLayout />,
                children: [
                  { path: "repertoires", element: <AdminRepertoireListPage /> },
                  // ✅ ÄNDRING 1 HÄR:
                  { path: "repertoires/:repertoireId/materials/*", element: <AdminRepertoireMaterialPage /> },
                  { path: "concerts", element: <AdminEventPage /> },
                  { path: "practice", element: <PracticePage /> },
                  { path: "users", element: <AdminUserManagementPage viewerRole="admin" /> },
                  { path: "attendance", element: <LeaderAttendancePage /> },
                ],
              },
            ],
          },
          {
            // Sektion för Körledare
            path: "leader",
            element: <LeaderLayout />,
            children: [
              {
                path: "choir/:groupName",
                element: <LeaderDashboard />, 
                children: [
                  {
                    index: true,
                    element: <Navigate to="repertoires" replace /> 
                  },
                  {
                    path: "repertoires",
                    element: <AdminRepertoireListPage />, 
                  },
                  {
                    // ✅ ÄNDRING 2 HÄR:
                    path: "repertoires/:repertoireId/materials/*",
                    element: <AdminRepertoireMaterialPage />,
                  },
                  {
                    path: "concerts",
                    element: <AdminEventPage />,
                  },
                  {
                    path: "users",
                    element: <AdminUserManagementPage viewerRole="leader" />
                  },
                  {
                    path: "practice",
                    element: <PracticePage />,
                  },
                  {
                    path: "attendance",
                    element: <LeaderAttendancePage />,
                  },
                ]
              }
            ],
          },
          {
            // Användarens sektion
            path: "user",
            element: <UserLayout />,
            children: [
              {
                path: "me/:groupName",
                element: <MemberDashboard />,
                children: [
                  {
                    index: true,
                    element: <Navigate to="repertoires" replace />
                  },
                  {
                    path: "repertoires",
                    element: <Outlet />,
                    children: [
                      {
                        index: true,
                        element: <MemberListRepertoirePage />,
                      },
                      {
                        path: ":repertoireId",
                        element: <MemberRepertoireMaterialPage />,
                      }
                    ]
                  },
                  {
                    path: "practice",
                    element: <PracticePage />,
                  },
                  {
                    path: "concerts",
                    element: <MemberEventPage />,
                  },
                ]
              },
            ]
          },
        ],
      },
    ],
  },
]);

export const AppRouter = () => {
  return <RouterProvider router={router} />;
};
