// src/routes/Router.tsx

import { createBrowserRouter, RouterProvider } from "react-router-dom";

// Importera dina sidkomponenter. De kommer ge ett fel tills vi skapar dem i nästa steg.
import { LoginPage } from "@/pages/LoginPage";
import { MaterialsPage } from "@/pages/MaterialsPage";

// Definiera applikationens "karta" över sidor
const router = createBrowserRouter([
  {
    path: "/",
    element: <MaterialsPage />, // Huvudsidan efter inloggning
  },
  {
    path: "/login",
    element: <LoginPage />, // Sidan för inloggning
  },
]);

// Skapa en komponent som vi kan använda i main.tsx
export const AppRouter = () => {
  return <RouterProvider router={router} />;
};
