import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { LoginPage } from "@/pages/LoginPage";
import { DashboardPage } from "@/pages/DashboardPage"; // Importera den nya sidan
import { AdminUploadPage } from "@/pages/admin/AdminUploadPage";
import { AdminGroupListPage } from '@/pages/admin/AdminGroupListPage';

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
    // NY ROUTE: Sidan som listar alla grupper
    path: "/admin/groups",
    element: <AdminGroupListPage />,
  },
  {
    // NY DYNAMISK ROUTE: Uppladdningssidan för en specifik grupp
    // ':groupName' är en parameter som vi kan läsa av i vår komponent.
    path: "/admin/groups/:groupName/upload",
    element: <AdminUploadPage />,
  },
]);

export const AppRouter = () => {
  return <RouterProvider router={router} />;
};