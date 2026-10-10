import { Outlet } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import styles from "./MemberDashboard.module.scss";

export const MemberDashboard = () => {
  const { user } = useAuth();

  if (!user) {
    return <div>Kunde inte ladda användardata.</div>;
  }

  return (
    <div className={styles.layout}>
      <Outlet />
    </div>
  );
};
