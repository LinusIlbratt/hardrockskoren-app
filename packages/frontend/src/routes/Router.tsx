import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { LoginPage } from "@/pages/LoginPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { AppLayout } from '@/components/layout/AppLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { UserLayout } from "@/components/layout/UserLayout";
import { AdminGroupListPage } from '@/pages/admin/AdminGroupListPage';
import { GroupDashboardLayout } from '@/components/layout/GroupDashboardLayout';
import { AdminRepertoireListPage } from '@/pages/admin/AdminRepertoireListPage';
import { AdminUploadPage } from '@/pages/admin/AdminUploadPage';
import { AdminUserManagementPage } from "@/pages/admin/AdminUserManagementPage";
import { RegistrationPage } from "@/pages/RegistrationPage";
import { AdminEventPage } from "@/pages/admin/AdminEventPage";
import { MemberDashboard } from "@/pages/member/MemberDashboard";
import { MemberListRepertoirePage } from "@/pages/member/MemberListRepertoirePage";
import { MemberRepertoireMaterialPage } from "@/pages/member/MemberRepertoireMaterialPage";
import { MemberEventPage } from "@/pages/member/MemberEventPage";
import { Outlet } from 'react-router-dom';

const router = createBrowserRouter([
  {
    path: "/login",
    element: <LoginPage />,
  },
  {
    // NY ROUTE FÖR REGISTRERING
    path: "/register",
    element: <RegistrationPage />,
  },
  {
    // En skyddad route som fungerar som förälder till ALLT
    // som kräver inloggning.
    path: "/",
    element: <ProtectedRoute />,
    children: [
      {
        // Denna layout (med MainNav) visas för alla inloggade användare
        element: <AppLayout />,
        children: [
          {
            // Startsidan för inloggade användare
            index: true, // index:true betyder att den matchar på path: "/"
            element: <DashboardPage />,
          },
          {
            // Alla admin-sidor ligger nu nästlade här
            path: "admin",
            element: <AdminLayout />,
            children: [
              {
                path: "globalMaterial",
                element: <AdminUploadPage />, // Placeholder för globalt material
              },
              {
                path: "practice",
                element: <p>Practice Page</p>, // Placeholder för sjungupp
              },
              {
                path: "groups",
                element: <AdminGroupListPage />,
              },
              {
                path: "groups/:groupName",
                element: <GroupDashboardLayout />,
                children: [
                  {
                    path: "repertoires",
                    element: <AdminRepertoireListPage />,
                  },
                  {
                    path: "repertoires/:repertoireId/materials",
                    element: <p>Repertoire Materials Page</p>, // Placeholder för repertoarmaterial
                  },
                  {
                    path: "concerts",
                    element: <AdminEventPage />,
                  },
                  {
                    path: "users",
                    element: <AdminUserManagementPage />, // Använd den nya komponenten här
                  },
                ],
              },
            ],
          },
          {
            // Användarens dashboard
            path: "user",
            element: <UserLayout />,
            children: [
              {
                path: "me",
                element: <MemberDashboard />,
                children: [
                  {
                    path: "userMaterial",
                    element: <Outlet />,
                    children: [
                      {
                        // index: true betyder att denna route renderas när URL:en är EXAKT /user/me/userMaterial
                        index: true,
                        element: <MemberListRepertoirePage />,
                      },
                      {
                        // Denna route renderas när URL:en är /user/me/userMaterial/EttId
                        path: ":repertoireId",
                        element: <MemberRepertoireMaterialPage />,
                      }
                    ]
                  },
                  {
                    path: "userSing",
                    element: <div>User Sing Page</div>,
                  },
                  {
                    path: "userDates",
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