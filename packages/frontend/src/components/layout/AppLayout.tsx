import { Outlet } from 'react-router-dom';
import { MainNav } from './../ui/nav/MainNav';

export const AppLayout = () => {
  return (
    <div>
      <MainNav />
      <main>
        {/* Outlet renderar den aktiva undersidan (t.ex. Dashboard eller AdminLayout) */}
        <Outlet />
      </main>
    </div>
  );
};