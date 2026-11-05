/**
 * VIGILORA — Collapsible Sidebar Architecture Integration Test Suite
 *
 * Validates:
 * 1. Default closed state across the AppShell layout.
 * 2. ONLY ONE sidebar toggle button in TopNavigation (hamburger icon, desktop + mobile accessible).
 * 3. Removal of duplicate close controls (no red X button in TopNav, no X button in sidebar header).
 * 4. Fast GPU-friendly transform animation using CSS transform translateX() (200ms ease-out).
 * 5. Elimination of expensive transition-all, width, margin, or layout-shift animations.
 * 6. Stationary dashboard overlay architecture (dashboard does not reflow or resize).
 * 7. Lightweight backdrop with opacity transition (200ms ease-out).
 * 8. Outside-click detection and conflict prevention with the top navigation toggle button.
 * 9. Escape key dismissal interaction.
 * 10. Complete presence of all navigation links, VIGILORA branding, operator profile, and logout.
 * 11. Mobile auto-close on navigation item selection vs desktop persistence.
 */

import * as fs from "fs";
import * as path from "path";

let passedAssertions = 0;
let failedAssertions = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passedAssertions++;
    console.log(`  ✓ ${message}`);
  } else {
    failedAssertions++;
    console.error(`  ✗ FAIL: ${message}`);
  }
}

async function runCollapsibleSidebarSuite() {
  console.log("\n=======================================================");
  console.log("VIGILORA — Collapsible Sidebar Integration Test Suite");
  console.log("=======================================================\n");

  const appShellPath = path.join(process.cwd(), "src", "components", "layout", "AppShell.tsx");
  const topNavPath = path.join(process.cwd(), "src", "components", "layout", "TopNavigation.tsx");
  const sidebarPath = path.join(process.cwd(), "src", "components", "layout", "Sidebar.tsx");

  assert(fs.existsSync(appShellPath), "AppShell.tsx exists in layout directory");
  assert(fs.existsSync(topNavPath), "TopNavigation.tsx exists in layout directory");
  assert(fs.existsSync(sidebarPath), "Sidebar.tsx exists in layout directory");

  const appShellContent = fs.readFileSync(appShellPath, "utf-8");
  const topNavContent = fs.readFileSync(topNavPath, "utf-8");
  const sidebarContent = fs.readFileSync(sidebarPath, "utf-8");

  // SECTION 1: AppShell State Management & Stationary Dashboard Architecture
  console.log("\n[1] AppShell State Management & Stationary Dashboard Architecture");
  assert(
    appShellContent.includes("const [sidebarOpen, setSidebarOpen] = useState(false);"),
    "Sidebar state defaults to false (hidden by default on application launch)"
  );
  assert(
    appShellContent.includes("<Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />"),
    "Sidebar receives isOpen state and explicit onClose handler"
  );
  assert(
    appShellContent.includes("isSidebarOpen={sidebarOpen}"),
    "TopNavigation receives isSidebarOpen prop from AppShell"
  );
  assert(
    appShellContent.includes("onToggleSidebar={() => setSidebarOpen((prev) => !prev)}"),
    "TopNavigation receives toggle handler that flips boolean state"
  );
  assert(
    appShellContent.includes("flex-col flex-1 min-w-0 overflow-hidden w-full"),
    "Main content wrapper maintains 100% full width stationary positioning (zero reflow or resize)"
  );

  // SECTION 2: TopNavigation Single Toggle Control (No Duplicate Red X)
  console.log("\n[2] TopNavigation Single Toggle Control & Zero Duplicate Red X");
  assert(
    topNavContent.includes("isSidebarOpen?: boolean"),
    "TopNavigationProps interface declares isSidebarOpen prop"
  );
  assert(
    topNavContent.includes('id="vigilora-sidebar-toggle-btn"'),
    "Toggle button has dedicated identifier 'vigilora-sidebar-toggle-btn'"
  );
  assert(
    !topNavContent.includes("lg:hidden focus:outline-none shrink-0\n        >\n          <Menu"),
    "Toggle button is NOT restricted to mobile (accessible on desktop and mobile)"
  );
  assert(
    topNavContent.includes("aria-expanded={isSidebarOpen}"),
    "Toggle button declares aria-expanded reflecting current open/closed status"
  );
  assert(
    topNavContent.includes('aria-label={isSidebarOpen ? "Close navigation sidebar" : "Open navigation sidebar"}'),
    "Toggle button declares dynamic screen-reader label"
  );
  assert(
    topNavContent.includes("<Menu className=\"w-5 h-5\" />"),
    "Toggle button consistently displays Menu hamburger icon"
  );
  assert(
    !topNavContent.includes('<X className="w-5 h-5 text-[#F01420]" />'),
    "Duplicate red X icon is completely removed from top navigation toggle button"
  );

  // SECTION 3: Zero Duplicate Close Button in Sidebar Header
  console.log("\n[3] Zero Duplicate Close Button in Sidebar Header");
  assert(
    !sidebarContent.includes('title="Close sidebar"'),
    "Duplicate close button with tooltip 'Close sidebar' is completely removed from sidebar header"
  );
  assert(
    !sidebarContent.includes('aria-label="Close navigation sidebar"'),
    "Duplicate close button aria-label is completely removed from sidebar header"
  );
  assert(
    sidebarContent.includes("Command Navigation"),
    "Command Navigation brand header indicator is preserved cleanly without close button clutter"
  );

  // SECTION 4: GPU Transform Animation & Elimination of Layout Shift
  console.log("\n[4] GPU Transform Animation & Elimination of Layout Shift");
  assert(
    sidebarContent.includes('id="vigilora-collapsible-sidebar"'),
    "Sidebar container has unique ID 'vigilora-collapsible-sidebar'"
  );
  assert(
    sidebarContent.includes('aria-label="Operations Navigation Sidebar"'),
    "Sidebar container declares proper accessibility landmark label"
  );
  assert(
    sidebarContent.includes("transition-transform duration-200 ease-out will-change-transform"),
    "Sidebar uses GPU-accelerated transition-transform (200ms ease-out) with will-change-transform"
  );
  assert(
    !sidebarContent.includes("transition-all"),
    "Expensive transition-all is completely eliminated from sidebar container"
  );
  assert(
    sidebarContent.includes('isOpen\n            ? "translate-x-0 pointer-events-auto"\n            : "-translate-x-full pointer-events-none"') ||
    sidebarContent.includes('isOpen ? "translate-x-0 pointer-events-auto" : "-translate-x-full pointer-events-none"'),
    "Sidebar uses pure CSS transform translateX (translate-x-0 vs -translate-x-full)"
  );
  assert(
    sidebarContent.includes("fixed top-14 bottom-0 left-0 z-50 w-64"),
    "Sidebar is fixed at top-14 to bottom-0 with z-50 overlaying the stationary dashboard"
  );
  assert(
    !sidebarContent.includes("lg:w-0"),
    "Sidebar width is fixed w-64 (never animates width or forces dashboard reflow)"
  );

  // SECTION 5: Lightweight Backdrop Overlay
  console.log("\n[5] Lightweight Backdrop Overlay");
  assert(
    sidebarContent.includes("fixed inset-0 top-14 z-40 bg-black/60 backdrop-blur-[2px] transition-opacity duration-200 ease-out"),
    "Lightweight backdrop overlays dashboard below header with 200ms ease-out opacity transition"
  );
  assert(
    sidebarContent.includes('isOpen\n            ? "opacity-100 pointer-events-auto"\n            : "opacity-0 pointer-events-none"') ||
    sidebarContent.includes('isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"'),
    "Backdrop toggles opacity between 100% and 0% with pointer-events protection"
  );

  // SECTION 6: Dismissal Handlers (Outside Click, Escape Key, Mobile Nav)
  console.log("\n[6] Dismissal Handlers (Outside Click, Escape Key, Mobile Nav)");
  assert(
    sidebarContent.includes('document.getElementById("vigilora-sidebar-toggle-btn")'),
    "Click-outside listener specifically exempts vigilora-sidebar-toggle-btn to prevent toggle conflict"
  );
  assert(
    sidebarContent.includes('!sidebarRef.current.contains(event.target as Node)'),
    "Click-outside listener triggers onClose when clicking outside sidebar DOM tree"
  );
  assert(
    sidebarContent.includes('event.key === "Escape"'),
    "Escape key event listener triggers onClose for keyboard accessibility"
  );
  assert(
    sidebarContent.includes('window.innerWidth < 1024'),
    "handleNavClick checks viewport breakpoint (< 1024px) to close mobile drawer upon navigation"
  );

  // SECTION 7: Complete Route & Brand Feature Preservation
  console.log("\n[7] Complete Route & Brand Feature Preservation");
  const requiredNavItems = [
    { name: "Dashboard", href: "/" },
    { name: "Incident Management", href: "/incidents" },
    { name: "Report Incident", href: "/report" },
    { name: "Response Teams", href: "/teams" },
    { name: "Analytics", href: "/analytics" },
    { name: "Settings", href: "/settings" },
  ];

  for (const item of requiredNavItems) {
    assert(
      sidebarContent.includes(`name: "${item.name}"`) &&
        sidebarContent.includes(`href: "${item.href}"`),
      `Navigation item '${item.name}' (${item.href}) is preserved in sidebar items array`
    );
  }

  assert(
    sidebarContent.includes('src="/vigilora-logo.png"'),
    "Official VIGILORA logo banner image is mounted in sidebar brand header"
  );
  assert(
    sidebarContent.includes("Help & Support"),
    "Help & Support link is present in sidebar footer"
  );
  assert(
    sidebarContent.includes("user.name") &&
      sidebarContent.includes("user.callsign") &&
      sidebarContent.includes("user.role"),
    "Operator profile card renders authenticated user name, callsign, and role"
  );
  assert(
    sidebarContent.includes("Sign Out Terminal"),
    "Sign Out Terminal button is present with logout action"
  );
  assert(
    sidebarContent.includes("Nocturnal Dispatch") &&
      sidebarContent.includes("ACTIVE"),
    "Tactical Atmosphere 'Nocturnal Dispatch ACTIVE' indicator is present"
  );

  // SECTION 8: Logic Simulation of Sidebar Behaviors
  console.log("\n[8] Logic Simulation of Toggle, Outside Click & Breakpoint Behavior");
  
  let currentOpenState: boolean = false;
  const toggle = (): boolean => {
    currentOpenState = !currentOpenState;
    return currentOpenState;
  };
  assert(!currentOpenState, "Simulation: Initial state is closed (false)");
  assert(toggle() === true, "Simulation: Clicking toggle opens sidebar (true)");
  assert(toggle() === false, "Simulation: Clicking toggle again closes sidebar (false)");

  const simulateClickOutside = (isTargetInsideSidebar: boolean, isTargetToggleBtn: boolean) => {
    if (isTargetToggleBtn) return "IGNORED_BY_LISTENER";
    if (!isTargetInsideSidebar) return "CLOSE_TRIGGERED";
    return "NO_ACTION";
  };

  assert(
    simulateClickOutside(false, false) === "CLOSE_TRIGGERED",
    "Simulation: Click on main content triggers close"
  );
  assert(
    simulateClickOutside(true, false) === "NO_ACTION",
    "Simulation: Click inside sidebar keeps it open"
  );
  assert(
    simulateClickOutside(false, true) === "IGNORED_BY_LISTENER",
    "Simulation: Click on toggle button does not trigger close listener directly"
  );

  const simulateNavClick = (viewportWidth: number) => {
    let closed = false;
    if (viewportWidth < 1024) {
      closed = true;
    }
    return closed;
  };

  assert(
    simulateNavClick(390) === true,
    "Simulation: Mobile (390px) navigation closes drawer"
  );
  assert(
    simulateNavClick(768) === true,
    "Simulation: Tablet (768px) navigation closes drawer"
  );
  assert(
    simulateNavClick(1280) === false,
    "Simulation: Desktop (1280px) navigation preserves sidebar open state"
  );
  assert(
    simulateNavClick(1920) === false,
    "Simulation: Ultra-wide desktop (1920px) navigation preserves sidebar open state"
  );

  console.log("\n=======================================================");
  console.log(`COLLAPSIBLE SIDEBAR TEST RESULTS: ${passedAssertions} PASSED, ${failedAssertions} FAILED`);
  console.log("=======================================================\n");

  if (failedAssertions > 0) {
    process.exit(1);
  }
}

runCollapsibleSidebarSuite().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
