import { createBrowserRouter, RouterProvider } from "react-router-dom";

// Importera alla dina sidor och layouts
import { LoginPage } from "@/pages/LoginPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { AppLayout } from '@/components/layout/AppLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { AdminGroupListPage } from '@/pages/admin/AdminGroupListPage';
import { GroupDashboardLayout } from '@/components/layout/GroupDashboardLayout';
import { AdminRepertoireListPage } from '@/pages/admin/AdminRepertoireListPage';
import { AdminUploadPage } from '@/pages/admin/AdminUploadPage';

const router = createBrowserRouter([
  {
    path: "/login",
    element: <LoginPage />,
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
                    element: <AdminUploadPage />,
                  },
                  {
                    path: "concerts",
                    element: <div>Översikt för körens konserter & repdatum</div>,
                  },
                  {
                    path: "users",
                    element: <div>Användarhantering för gruppen</div>,
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
]);

export const AppRouter = () => {
  return <RouterProvider router={router} />;
};