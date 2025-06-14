import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { LoginPage } from "@/pages/LoginPage";
import { DashboardPage } from "@/pages/DashboardPage"; // Importera den nya sidan
import { AdminUploadPage } from "@/pages/admin/AdminUploadPage";
import { AdminGroupListPage } from '@/pages/admin/AdminGroupListPage';
import { GroupDashboardLayout } from "@/components/layout/GroupDashboardLayout";
import { AdminLayout } from "@/components/layout/AdminLayout";

const router = createBrowserRouter([
  {
    path: "/",
    element: <DashboardPage />,
  },
  {
    path: "/login",
    element: <LoginPage />,
  },
  {
    // En övergripande layout för alla admin-sidor
    path: "/admin",
    element: <AdminLayout />,
    children: [
      {
        // Sidan som listar alla grupper
        // Fullständig sökväg: /admin/groups
        path: "groups",
        element: <AdminGroupListPage />,
      },
      {
        // En nästlad layout för en specifik grupp
        // Fullständig sökväg: /admin/groups/:groupName
        path: "groups/:groupName",
        element: <GroupDashboardLayout />,
        children: [
          {
            // Sidan för innehåll/uppladdning
            // Fullständig sökväg: /admin/groups/:groupName/content
            path: "content",
            element: <AdminUploadPage />,
          },
          {
            // Sidan för översikt
            // Fullständig sökväg: /admin/groups/:groupName/overview
            path: "repetoar",
            element: <div>Körens repetoarer</div>,
          },
          {
            // Sidan för översikt
            // Fullständig sökväg: /admin/groups/:groupName/overview
            path: "concerts",
            element: <div>Översikt för körens konserter & repdatum</div>,
          },
          {
            // Sidan för användare
            // Fullständig sökväg: /admin/groups/:groupName/users
            path: "users",
            element: <div>Användarhantering för gruppen</div>,
          },
        ],
      },
    ],
  },
]);

export const AppRouter = () => {
  return <RouterProvider router={router} />;
};