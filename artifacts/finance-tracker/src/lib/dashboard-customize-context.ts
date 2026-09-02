import { createContext, useContext } from "react";

export const DashboardCustomizeContext = createContext(false);
export const useDashboardCustomize = () => useContext(DashboardCustomizeContext);
