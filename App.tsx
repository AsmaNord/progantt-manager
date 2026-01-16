
import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { parseISO, format, addDays, startOfDay, isValid, isWeekend, getISOWeek, eachDayOfInterval, isSameDay } from 'date-fns';
import { 
  Plus, 
  Trash2, 
  GanttChartSquare, 
  Navigation,
  Calendar,
  GripVertical,
  AlertTriangle,
  X,
  User,
  Maximize2,
  ArrowLeft,
  LayoutDashboard,
  Clock,
  Briefcase,
  ExternalLink,
  Settings2,
  Edit3,
  EyeOff,
  Eye,
  Undo2,
  Redo2,
  History,
  Save,
  RotateCcw,
  Check,
  Database
} from 'lucide-react';

import { ProjectItem, ItemType, DependencyMode, Project, Backup } from './types';
import { 
  calculateEndDate, 
  calculateStartDate,
  calculateWorkDays, 
  getProjectDateRange, 
  STEP_COLORS,
  formatProjectDate
} from './utils/dateHelpers';

// Constants for LocalStorage keys
const STORAGE_KEY_PROJECTS = 'pro_gantt_projects_v1';
const STORAGE_KEY_ACTIVE_ID = 'pro_gantt_active_id_v1';

// Helper for difference in days that works across TZ
function getDaysDiff(dateLeft: Date, dateRight: Date): number {
  if (!isValid(dateLeft) || !isValid(dateRight)) return 0;
  return Math.round((startOfDay(dateLeft).getTime() - startOfDay(dateRight).getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Automatically fixes all sId, tId and colors based on the visual list order.
 */
const reIndexItems = (list: ProjectItem[]): ProjectItem[] => {
  let stepCounter = 0;
  let taskCounter = 0;
  let currentStepColor = STEP_COLORS[0];

  const itemsWithIds = list.map((item) => {
    if (item.type === 'S') {
      stepCounter++;
      taskCounter = 0;
      currentStepColor = STEP_COLORS[(stepCounter - 1) % STEP_COLORS.length] || STEP_COLORS[0];
      return { ...item, sId: stepCounter, tId: "-1", color: currentStepColor };
    } else {
      taskCounter++;
      return { ...item, sId: stepCounter || 1, tId: `${stepCounter || 1}.${taskCounter}`, color: currentStepColor };
    }
  });

  return itemsWithIds.map((item, _, arr) => {
    if (item.type === 'S') {
      const childTasks = arr.filter(t => t.type === 'T' && t.sId === item.sId);
      if (childTasks.length > 0) {
        const startDates = childTasks.map(t => parseISO(t.start).getTime());
        const endDates = childTasks.map(t => parseISO(t.end).getTime());
        const minStart = new Date(Math.min(...startDates));
        const maxEnd = new Date(Math.max(...endDates));
        const startStr = format(minStart, 'yyyy-MM-dd');
        const endStr = format(maxEnd, 'yyyy-MM-dd');
        return { ...item, start: startStr, end: endStr, workDays: calculateWorkDays(startStr, endStr) };
      }
    }
    return item;
  });
};

export default function App() {
  // --- LOCAL STORAGE LOADING ---
  const [projects, setProjects] = useState<Project[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_PROJECTS);
    return saved ? JSON.parse(saved) : [];
  });

  const [currentProjectId, setCurrentProjectId] = useState<string | null>(() => {
    return localStorage.getItem(STORAGE_KEY_ACTIVE_ID);
  });

  const [projectModal, setProjectModal] = useState<{ mode: 'create' | 'edit', project?: Project } | null>(null);
  const [showTable, setShowTable] = useState(true);
  const [hideWeekends, setHideWeekends] = useState(false);
  const [tableWidth, setTableWidth] = useState(window.innerWidth > 1400 ? 1050 : Math.floor(window.innerWidth * 0.6));
  const [isResizing, setIsResizing] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  
  // Specific item for deletion confirmation
  const [itemToDelete, setItemToDelete] = useState<ProjectItem | null>(null);
  
  const [confirmingDeleteProject, setConfirmingDeleteProject] = useState<string | null>(null);
  const [showBackupModal, setShowBackupModal] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  
  // Undo/Redo state for the current active project
  const [history, setHistory] = useState<ProjectItem[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const ganttContainerRef = useRef<HTMLDivElement>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const isSyncingScroll = useRef(false);

  const activeProject = useMemo(() => projects.find(p => p.id === currentProjectId), [projects, currentProjectId]);
  const items = activeProject?.items || [];

  const rowHeight = 40; 
  const dayWidth = 32;  
  const headerHeight = 100;
  const bottomButtonHeight = 46; // Matches the "CREATE NEW PHASE" row height
  
  const { start: rawTimelineStart, end: rawTimelineEnd } = useMemo(() => getProjectDateRange(items), [items]);

  const visibleDates = useMemo(() => {
    if (!isValid(rawTimelineStart) || !isValid(rawTimelineEnd)) return [];
    const allDays = eachDayOfInterval({ start: rawTimelineStart, end: rawTimelineEnd });
    if (hideWeekends) {
      return allDays.filter(d => !isWeekend(d));
    }
    return allDays;
  }, [rawTimelineStart, rawTimelineEnd, hideWeekends]);

  const daysCount = visibleDates.length;

  const todayX = useMemo(() => {
    const today = startOfDay(new Date());
    const idx = visibleDates.findIndex(d => isSameDay(d, today));
    return idx === -1 ? -100 : idx * dayWidth;
  }, [visibleDates, dayWidth]);

  // --- LOCAL STORAGE PERSISTENCE ---
  useEffect(() => {
    setIsSyncing(true);
    localStorage.setItem(STORAGE_KEY_PROJECTS, JSON.stringify(projects));
    const timer = setTimeout(() => setIsSyncing(false), 500);
    return () => clearTimeout(timer);
  }, [projects]);

  useEffect(() => {
    if (currentProjectId) {
      localStorage.setItem(STORAGE_KEY_ACTIVE_ID, currentProjectId);
    } else {
      localStorage.removeItem(STORAGE_KEY_ACTIVE_ID);
    }
  }, [currentProjectId]);

  const jumpToToday = useCallback(() => {
    if (ganttContainerRef.current && visibleDates.length > 0) {
      const today = startOfDay(new Date());
      let todayIdx = visibleDates.findIndex(d => isSameDay(d, today));
      if (todayIdx === -1) todayIdx = visibleDates.findIndex(d => d > today);
      if (todayIdx !== -1) {
        const scrollPos = (todayIdx * dayWidth) - (ganttContainerRef.current.clientWidth / 2);
        ganttContainerRef.current.scrollTo({ left: Math.max(0, scrollPos), behavior: 'smooth' });
      }
    }
  }, [visibleDates]);

  useEffect(() => {
    if (currentProjectId) {
      const timer = setTimeout(jumpToToday, 500);
      return () => clearTimeout(timer);
    }
  }, [currentProjectId, jumpToToday]);

  useEffect(() => {
    if (activeProject) {
      setHistory([activeProject.items]);
      setHistoryIndex(0);
    } else {
      setHistory([]);
      setHistoryIndex(-1);
    }
  }, [currentProjectId]);

  const saveBackup = useCallback((project: Project) => {
    const key = `backups_${project.id}`;
    const raw = localStorage.getItem(key);
    const backups: Backup[] = raw ? JSON.parse(raw) : [];
    const newBackup: Backup = {
      timestamp: new Date().toISOString(),
      project: JSON.parse(JSON.stringify(project))
    };
    const updated = [newBackup, ...backups].slice(0, 10);
    localStorage.setItem(key, JSON.stringify(updated));
  }, []);

  useEffect(() => {
    if (!activeProject) return;
    const interval = setInterval(() => {
      saveBackup(activeProject);
    }, 3600000); // 1 hour
    return () => clearInterval(interval);
  }, [activeProject, saveBackup]);

  // Improved Scroll Sync logic to prevent loops and jitter
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (isSyncingScroll.current) return;
    
    isSyncingScroll.current = true;
    const { scrollTop } = e.currentTarget;

    if (e.currentTarget === tableContainerRef.current && ganttContainerRef.current) {
      ganttContainerRef.current.scrollTop = scrollTop;
    } else if (e.currentTarget === ganttContainerRef.current && tableContainerRef.current) {
      tableContainerRef.current.scrollTop = scrollTop;
    }

    // Release sync flag after a short timeout or next tick
    requestAnimationFrame(() => {
      isSyncingScroll.current = false;
    });
  };

  const startResizing = useCallback((e: React.MouseEvent) => {
    setIsResizing(true);
    e.preventDefault();
  }, []);

  const stopResizing = useCallback(() => setIsResizing(false), []);

  const resize = useCallback((e: MouseEvent) => {
    if (isResizing) {
      const newWidth = e.clientX;
      if (newWidth > 300 && newWidth < window.innerWidth * 0.95) setTableWidth(newWidth);
    }
  }, [isResizing]);

  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', resize);
      window.addEventListener('mouseup', stopResizing);
    }
    return () => {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
    };
  }, [isResizing, resize, stopResizing]);

  const updateItemsWithHistory = useCallback((newItems: ProjectItem[], isUndoRedoAction = false) => {
    if (!currentProjectId) return;
    
    setProjects(prev => prev.map(p => p.id === currentProjectId ? { ...p, items: newItems } : p));

    if (!isUndoRedoAction) {
      setHistory(prev => {
        const nextHistory = prev.slice(0, historyIndex + 1);
        const updated = [...nextHistory, newItems].slice(-11);
        setHistoryIndex(updated.length - 1);
        return updated;
      });
    }
  }, [currentProjectId, historyIndex]);

  const undo = () => {
    if (historyIndex > 0) {
      const prevItems = history[historyIndex - 1];
      setHistoryIndex(historyIndex - 1);
      updateItemsWithHistory(prevItems, true);
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      const nextItems = history[historyIndex + 1];
      setHistoryIndex(historyIndex + 1);
      updateItemsWithHistory(nextItems, true);
    }
  };

  const updateItem = useCallback((id: string, updates: Partial<ProjectItem>) => {
    if (!activeProject) return;
    const prevItems = activeProject.items;
    const index = prevItems.findIndex(i => i.id === id);
    if (index === -1) return;
    
    let newItems = [...prevItems];
    let item = { ...newItems[index], ...updates };

    if ('progress' in updates && updates.progress !== undefined) {
      item.progress = Math.min(100, Math.max(0, Number(updates.progress) || 0));
    }
    if ('workDays' in updates && updates.workDays !== undefined) {
      item.end = calculateEndDate(item.start, updates.workDays);
    } else if ('end' in updates && updates.end !== undefined) {
      item.workDays = calculateWorkDays(item.start, updates.end);
    } else if ('start' in updates && updates.start !== undefined) {
      item.end = calculateEndDate(updates.start, item.workDays);
    }

    newItems[index] = item;

    for (let i = index; i < newItems.length - 1; i++) {
      const current = newItems[i];
      const next = { ...newItems[i + 1] };
      if (next.type === 'T') {
        let nextStart = next.start;
        let nextEnd = next.end;
        switch (current.mode) {
          case 'FS': nextStart = format(addDays(parseISO(current.end), 1), 'yyyy-MM-dd'); break;
          case 'SS': nextStart = current.start; break;
          case 'SF': nextEnd = current.start; break;
          case 'FF': nextEnd = current.end; break;
        }
        if (current.mode === 'FS' || current.mode === 'SS') nextEnd = calculateEndDate(nextStart, next.workDays);
        if (current.mode === 'SF' || current.mode === 'FF') nextStart = calculateStartDate(nextEnd, next.workDays);
        if (next.start !== nextStart || next.end !== nextEnd) {
          next.start = nextStart; next.end = nextEnd; newItems[i+1] = next;
        }
      }
    }
    updateItemsWithHistory(reIndexItems(newItems));
  }, [activeProject, updateItemsWithHistory]);

  const handleProjectSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const start = formData.get('start') as string;
    const workDays = parseInt(formData.get('workDays') as string) || 1;
    const end = calculateEndDate(start, workDays);
    const name = formData.get('name') as string;
    const accountable = formData.get('accountable') as string;

    if (projectModal?.mode === 'create') {
      const newProject: Project = {
        id: uuidv4(),
        name,
        accountable,
        start,
        end,
        workDays,
        items: reIndexItems([
          {
            id: uuidv4(),
            sId: 1,
            tId: "-1",
            type: 'S',
            description: "Initial Phase",
            accountable,
            workDays,
            start,
            end,
            progress: 0,
            mode: 'FS',
            color: STEP_COLORS[0]
          }
        ]),
        createdAt: Date.now()
      };
      setProjects(prev => [...prev, newProject]);
      setCurrentProjectId(newProject.id);
    } else if (projectModal?.project) {
      setProjects(prev => prev.map(p => p.id === projectModal.project!.id ? {
        ...p,
        name,
        accountable,
        start,
        end,
        workDays
      } : p));
    }
    setProjectModal(null);
  };

  const addItemAt = (index: number) => {
    const parent = items[index];
    const newItem: ProjectItem = {
      id: uuidv4(), sId: parent.sId, tId: `${parent.sId}.new`, type: 'T',
      description: "New Task", accountable: "", workDays: 1, start: parent.end,
      end: parent.end, progress: 0, mode: 'FS', color: parent.color
    };
    const updated = [...items];
    updated.splice(index + 1, 0, newItem);
    updateItemsWithHistory(reIndexItems(updated));
  };

  const addStep = () => {
    const lastItem = items[items.length - 1];
    const baseDate = lastItem ? lastItem.end : format(new Date(), 'yyyy-MM-dd');
    const newStep: ProjectItem = {
      id: uuidv4(), sId: 0, tId: "-1", type: 'S', description: "New Phase",
      accountable: "", workDays: 1, start: baseDate, end: baseDate, progress: 0, mode: 'FS', color: STEP_COLORS[0]
    };
    updateItemsWithHistory(reIndexItems([...items, newStep]));
  };

  const deleteProject = (id: string) => {
    setProjects(prev => prev.filter(p => p.id !== id));
    if (currentProjectId === id) setCurrentProjectId(null);
    setConfirmingDeleteProject(null);
    localStorage.removeItem(`backups_${id}`);
  };

  const onDragStart = (idx: number) => {
    setDraggedIndex(idx);
  };

  const onDrop = (targetIdx: number) => {
    if (draggedIndex === null || draggedIndex === targetIdx) return;
    const list = [...items];
    const sourceItem = list[draggedIndex];
    if (sourceItem.type === 'S') {
      const stepItems = list.filter(i => i.sId === sourceItem.sId);
      const others = list.filter(i => i.sId !== sourceItem.sId);
      const targetItem = items[targetIdx];
      let insertPos = others.findIndex(i => i.id === targetItem.id);
      if (insertPos === -1) insertPos = others.length;
      others.splice(draggedIndex < targetIdx ? insertPos + 1 : insertPos, 0, ...stepItems);
      updateItemsWithHistory(reIndexItems(others));
    } else {
      const [moved] = list.splice(draggedIndex, 1);
      list.splice(targetIdx, 0, moved);
      updateItemsWithHistory(reIndexItems(list));
    }
    setDraggedIndex(null);
  };

  const restoreBackup = (backup: Backup) => {
    setProjects(prev => prev.map(p => p.id === backup.project.id ? backup.project : p));
    setHistory([backup.project.items]);
    setHistoryIndex(0);
    setShowBackupModal(false);
  };

  const executeDeleteItem = () => {
    if (!itemToDelete) return;
    
    let newList: ProjectItem[];
    if (itemToDelete.type === 'S') {
      // Delete the step and ALL child tasks sharing the same sId
      newList = items.filter(i => i.id !== itemToDelete.id && i.sId !== itemToDelete.sId);
    } else {
      newList = items.filter(i => i.id !== itemToDelete.id);
    }
    
    updateItemsWithHistory(reIndexItems(newList));
    setItemToDelete(null);
  };

  if (!currentProjectId) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <header className="bg-[#1a2b3c] text-white px-8 py-6 flex items-center justify-between shadow-xl">
          <div className="flex items-center space-x-4">
            <LayoutDashboard className="w-8 h-8 text-indigo-400" />
            <div>
              <h1 className="text-2xl font-black uppercase tracking-tight">Project Dashboard</h1>
              <p className="text-xs text-indigo-300 font-bold tracking-widest uppercase">Select or create a workspace</p>
            </div>
          </div>
          <button 
            onClick={() => setProjectModal({ mode: 'create' })}
            className="flex items-center px-6 py-3 bg-indigo-600 hover:bg-indigo-700 rounded-lg font-bold text-sm transition-all shadow-lg shadow-indigo-500/20"
          >
            <Plus className="w-5 h-5 mr-2" /> NEW PROJECT
          </button>
        </header>

        <main className="flex-1 p-10 max-w-7xl mx-auto w-full">
          {projects.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[50vh] text-center border-4 border-dashed border-gray-200 rounded-3xl bg-white/50">
              <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mb-6">
                <Briefcase className="w-10 h-10 text-indigo-200" />
              </div>
              <h2 className="text-xl font-bold text-gray-800 mb-2">No Projects Found</h2>
              <p className="text-gray-500 max-w-sm mb-8">Get started by creating your first professional Gantt project workspace.</p>
              <button onClick={() => setProjectModal({ mode: 'create' })} className="px-8 py-3 bg-white border-2 border-indigo-600 text-indigo-600 font-bold rounded-xl hover:bg-indigo-50 transition-all">
                CREATE PROJECT NOW
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {projects.map(p => (
                <div 
                  key={p.id} 
                  onClick={() => setCurrentProjectId(p.id)}
                  className="group bg-white rounded-2xl border border-gray-200 p-6 shadow-sm hover:shadow-2xl hover:-translate-y-1 transition-all cursor-pointer relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0 p-4 flex space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={(e) => { e.stopPropagation(); setProjectModal({ mode: 'edit', project: p }); }} 
                      className="p-2 bg-indigo-50 text-indigo-500 rounded-lg hover:bg-indigo-100 transition-colors"
                      title="Edit Project Info"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); setConfirmingDeleteProject(p.id); }} 
                      className="p-2 bg-red-50 text-red-500 rounded-lg hover:bg-red-100 transition-colors"
                      title="Delete Workspace"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex items-center space-x-3 mb-6">
                    <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-bold text-xs">PRJ</div>
                    <div>
                      <h3 className="font-bold text-gray-900 group-hover:text-indigo-600 transition-colors truncate max-w-[180px]">{p.name}</h3>
                      <p className="text-[10px] text-gray-400 font-bold tracking-widest uppercase">ID: {p.id.slice(0,8)}</p>
                    </div>
                  </div>
                  <div className="space-y-3 mb-6">
                    <div className="flex items-center text-[11px] text-gray-500">
                      <User className="w-3.5 h-3.5 mr-2 text-indigo-400" />
                      <span className="font-bold uppercase tracking-tighter">Owner:</span>
                      <span className="ml-2 text-gray-800">{p.accountable || 'Unassigned'}</span>
                    </div>
                    <div className="flex items-center text-[11px] text-gray-500">
                      <Calendar className="w-3.5 h-3.5 mr-2 text-indigo-400" />
                      <span className="font-bold uppercase tracking-tighter">Period:</span>
                      <span className="ml-2 text-gray-800">{formatProjectDate(p.start)} - {formatProjectDate(p.end)}</span>
                    </div>
                    <div className="flex items-center text-[11px] text-gray-500">
                      <Clock className="w-3.5 h-3.5 mr-2 text-indigo-400" />
                      <span className="font-bold uppercase tracking-tighter">Total Days:</span>
                      <span className="ml-2 text-gray-800">{p.workDays} Work Days</span>
                    </div>
                  </div>
                  <div className="pt-4 border-t border-gray-100 flex items-center justify-between">
                    <span className="text-[10px] text-gray-400 font-bold uppercase">{p.items.length} Tasks/Steps</span>
                    <span className="text-indigo-600 font-bold text-xs flex items-center group-hover:underline">OPEN WORKSPACE <ExternalLink className="w-3 h-3 ml-1.5" /></span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>

        {projectModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#1a2b3c]/80 backdrop-blur-md animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden animate-in zoom-in-95 duration-200">
              <form onSubmit={handleProjectSubmit}>
                <div className="px-8 py-6 bg-gray-50 border-b flex items-center justify-between">
                  <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight">
                    {projectModal.mode === 'create' ? 'Create New Project' : 'Edit Project Details'}
                  </h3>
                  <button type="button" onClick={() => setProjectModal(null)} className="text-gray-400 hover:text-gray-600"><X /></button>
                </div>
                <div className="p-8 space-y-6">
                  <div>
                    <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Project Description/Name</label>
                    <input name="name" required defaultValue={projectModal.project?.name} className="w-full px-4 py-3 bg-gray-100 border-none rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all font-bold" placeholder="e.g. Website Redesign 2025" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Responsible Person (Accountable)</label>
                    <input name="accountable" required defaultValue={projectModal.project?.accountable} className="w-full px-4 py-3 bg-gray-100 border-none rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all font-bold" placeholder="e.g. John Smith" />
                  </div>
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Start Date</label>
                      <input name="start" type="date" required defaultValue={projectModal.project?.start || format(new Date(), 'yyyy-MM-dd')} className="w-full px-4 py-3 bg-gray-100 border-none rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all font-bold" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Work Days</label>
                      <input name="workDays" type="number" required defaultValue={projectModal.project?.workDays || "10"} className="w-full px-4 py-3 bg-gray-100 border-none rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all font-bold" />
                    </div>
                  </div>
                </div>
                <div className="px-8 py-6 bg-gray-50 flex items-center justify-end space-x-4">
                  <button type="button" onClick={() => setProjectModal(null)} className="px-6 py-3 text-sm font-bold text-gray-500 hover:text-gray-700">CANCEL</button>
                  <button type="submit" className="px-10 py-3 bg-indigo-600 text-white font-bold rounded-xl shadow-lg hover:bg-indigo-700 transition-all">
                    {projectModal.mode === 'create' ? 'INITIALIZE WORKSPACE' : 'SAVE CHANGES'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {confirmingDeleteProject && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
              <div className="px-8 py-10 text-center">
                <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
                  <AlertTriangle className="w-10 h-10 text-red-500" />
                </div>
                <h3 className="text-xl font-black text-gray-900 mb-2 uppercase tracking-tight">Delete Workspace?</h3>
                <p className="text-gray-500 text-sm leading-relaxed mb-8">
                  Are you sure you want to delete this workspace? This will remove all associated phases and tasks forever. This action is irreversible.
                </p>
                <div className="flex flex-col space-y-3">
                  <button 
                    onClick={() => deleteProject(confirmingDeleteProject)}
                    className="w-full py-4 bg-red-600 text-white font-black rounded-2xl hover:bg-red-700 transition-all shadow-lg shadow-red-500/20 uppercase tracking-widest text-xs"
                  >
                    YES, DELETE EVERYTHING
                  </button>
                  <button 
                    onClick={() => setConfirmingDeleteProject(null)}
                    className="w-full py-4 bg-gray-100 text-gray-500 font-bold rounded-2xl hover:bg-gray-200 transition-all uppercase tracking-widest text-xs"
                  >
                    KEEP WORKSPACE
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-screen overflow-hidden bg-[#f3f4f6] ${isResizing ? 'cursor-col-resize select-none' : ''}`}>
      {/* Improved Ergonomic Delete Modal */}
      {itemToDelete && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-[#1a2b3c]/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden p-0 animate-in zoom-in-95 duration-200 border border-gray-100">
            <div className="p-8 text-center">
              <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
                <Trash2 className="w-10 h-10 text-red-500" />
              </div>
              <h3 className="text-xl font-black text-gray-900 mb-2 uppercase tracking-tight">
                {itemToDelete.type === 'S' ? 'Delete Phase?' : 'Delete Task?'}
              </h3>
              <div className="bg-gray-50 p-4 rounded-xl mb-6 text-left border border-gray-100">
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-1">
                  {itemToDelete.type === 'S' ? 'Step Name' : 'Task Description'}
                </p>
                <p className="text-sm font-bold text-gray-800 italic">"{itemToDelete.description}"</p>
              </div>
              <p className="text-gray-500 text-sm leading-relaxed mb-8 px-4">
                {itemToDelete.type === 'S' 
                  ? "Are you sure? This will permanently delete this Phase and ALL associated tasks belonging to it." 
                  : "Are you sure you want to delete this task? This action is permanent."}
              </p>
              <div className="flex flex-col space-y-3">
                <button 
                  onClick={executeDeleteItem}
                  className="w-full py-4 bg-red-600 text-white font-black rounded-2xl hover:bg-red-700 transition-all shadow-lg shadow-red-500/20 uppercase tracking-widest text-xs"
                >
                  {itemToDelete.type === 'S' ? 'DELETE PHASE & ALL TASKS' : 'DELETE TASK'}
                </button>
                <button 
                  onClick={() => setItemToDelete(null)}
                  className="w-full py-4 bg-gray-100 text-gray-500 font-bold rounded-2xl hover:bg-gray-200 transition-all uppercase tracking-widest text-xs"
                >
                  KEEP IT
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showBackupModal && activeProject && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-8 py-6 bg-gray-50 border-b flex items-center justify-between">
              <div className="flex items-center space-x-3 text-indigo-600">
                <History className="w-6 h-6" />
                <h3 className="text-xl font-black uppercase tracking-tight">Version Snapshots</h3>
              </div>
              <button onClick={() => setShowBackupModal(false)} className="text-gray-400 hover:text-gray-600"><X /></button>
            </div>
            <div className="p-8">
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 mb-6 flex items-start space-x-3">
                <Clock className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-700 leading-relaxed">
                  Historical snapshots are stored in your browser's local storage. Restoring a version will replace your current workspace.
                </p>
              </div>
              
              <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                {(() => {
                   const backups: Backup[] = JSON.parse(localStorage.getItem(`backups_${activeProject.id}`) || '[]');
                   if (backups.length === 0) {
                     return <div className="text-center py-10 text-gray-400 font-bold uppercase tracking-widest text-xs">No snapshots available yet</div>;
                   }
                   return backups.map((b, i) => (
                     <div key={i} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100 hover:border-indigo-200 transition-all group">
                       <div className="flex items-center space-x-4">
                         <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-lg flex items-center justify-center font-black text-xs">V{backups.length - i}</div>
                         <div>
                           <p className="text-sm font-bold text-gray-800">{format(parseISO(b.timestamp), 'PPP')}</p>
                           <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{format(parseISO(b.timestamp), 'pp')} • {b.project.items.length} Work Items</p>
                         </div>
                       </div>
                       <button 
                         onClick={() => restoreBackup(b)}
                         className="flex items-center px-4 py-2 bg-white border border-indigo-200 text-indigo-600 rounded-lg text-xs font-black uppercase hover:bg-indigo-600 hover:text-white transition-all shadow-sm"
                       >
                         <RotateCcw className="w-3.5 h-3.5 mr-2" /> RESTORE
                       </button>
                     </div>
                   ));
                })()}
              </div>
            </div>
            <div className="px-8 py-6 bg-gray-50 flex items-center justify-between">
              <p className="text-[10px] text-gray-400 font-bold uppercase">Browser-based persistence active</p>
              <button 
                onClick={() => { saveBackup(activeProject); setShowBackupModal(false); }}
                className="flex items-center px-6 py-2 bg-indigo-600 text-white rounded-lg text-xs font-black uppercase hover:bg-indigo-700 shadow-lg"
              >
                <Save className="w-3.5 h-3.5 mr-2" /> Manual Snapshot
              </button>
            </div>
          </div>
        </div>
      )}

      {projectModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#1a2b3c]/80 backdrop-blur-md">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden">
            <form onSubmit={handleProjectSubmit}>
              <div className="px-8 py-6 bg-gray-50 border-b flex items-center justify-between">
                <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight">Edit Project Details</h3>
                <button type="button" onClick={() => setProjectModal(null)} className="text-gray-400 hover:text-gray-600"><X /></button>
              </div>
              <div className="p-8 space-y-6">
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Project Name</label>
                  <input name="name" required defaultValue={activeProject.name} className="w-full px-4 py-3 bg-gray-100 border-none rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all font-bold" />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Responsible Person</label>
                  <input name="accountable" required defaultValue={activeProject.accountable} className="w-full px-4 py-3 bg-gray-100 border-none rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all font-bold" />
                </div>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Start Date</label>
                    <input name="start" type="date" required defaultValue={activeProject.start} className="w-full px-4 py-3 bg-gray-100 border-none rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all font-bold" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Work Days</label>
                    <input name="workDays" type="number" required defaultValue={activeProject.workDays} className="w-full px-4 py-3 bg-gray-100 border-none rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all font-bold" />
                  </div>
                </div>
              </div>
              <div className="px-8 py-6 bg-gray-50 flex items-center justify-end space-x-4">
                <button type="button" onClick={() => setProjectModal(null)} className="px-6 py-3 text-sm font-bold text-gray-500 hover:text-gray-700">CANCEL</button>
                <button type="submit" className="px-10 py-3 bg-indigo-600 text-white font-bold rounded-xl shadow-lg hover:bg-indigo-700 transition-all">SAVE CHANGES</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <header className="bg-[#1a2b3c] text-white px-6 py-3 flex items-center justify-between border-b border-[#2c3e50] shadow-xl z-30">
        <div className="flex items-center space-x-6">
          <button onClick={() => setCurrentProjectId(null)} className="p-2 hover:bg-white/10 rounded-lg transition-colors group">
            <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
          </button>
          <div className="flex items-center space-x-3">
            <GanttChartSquare className="w-7 h-7 text-indigo-400" />
            <div className="flex flex-col">
              <div className="flex items-center space-x-2">
                <h1 className="text-lg font-bold tracking-wider uppercase truncate max-w-[300px]">{activeProject.name}</h1>
                <button 
                  onClick={() => setProjectModal({ mode: 'edit', project: activeProject })}
                  className="p-1 hover:bg-white/10 rounded text-gray-400 hover:text-white transition-all"
                >
                  <Settings2 className="w-4 h-4" />
                </button>
              </div>
              <p className="text-[10px] text-gray-400 font-medium uppercase tracking-widest">Workspace • {activeProject.accountable}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <div className="flex items-center bg-[#2c3e50] rounded-lg p-1 border border-[#5d6d7e]">
            <button 
              disabled={historyIndex <= 0}
              onClick={undo}
              className={`p-2 rounded hover:bg-white/10 transition-all ${historyIndex <= 0 ? 'opacity-30 cursor-not-allowed' : 'text-indigo-300'}`}
              title="Undo Action"
            >
              <Undo2 className="w-4 h-4" />
            </button>
            <div className="w-[1px] h-4 bg-[#5d6d7e] mx-1"></div>
            <button 
              disabled={historyIndex >= history.length - 1}
              onClick={redo}
              className={`p-2 rounded hover:bg-white/10 transition-all ${historyIndex >= history.length - 1 ? 'opacity-30 cursor-not-allowed' : 'text-indigo-300'}`}
              title="Redo Action"
            >
              <Redo2 className="w-4 h-4" />
            </button>
          </div>

          <button 
            onClick={() => setShowBackupModal(true)}
            className="flex items-center px-4 py-2 text-[10px] font-bold bg-[#34495e] border border-[#5d6d7e] rounded-lg hover:bg-[#2c3e50] transition-all text-amber-400 shadow-sm"
          >
            <History className="w-4 h-4 mr-2" /> SNAPSHOTS
          </button>

          <button onClick={() => setHideWeekends(!hideWeekends)} className={`flex items-center px-4 py-2 text-[10px] font-bold rounded-lg transition-all shadow-sm ${hideWeekends ? 'bg-indigo-600 text-white' : 'bg-[#34495e] text-gray-300 border border-[#5d6d7e] hover:bg-[#2c3e50]'}`}>
            {hideWeekends ? <Eye className="w-3.5 h-3.5 mr-2" /> : <EyeOff className="w-3.5 h-3.5 mr-2" />}
            {hideWeekends ? 'SHOW WEEKENDS' : 'HIDE WEEKENDS'}
          </button>
          
          <button onClick={jumpToToday} className="flex items-center px-6 py-2 text-[10px] font-bold bg-[#34495e] border border-[#5d6d7e] rounded-lg hover:bg-[#2c3e50] transition-all shadow-sm">
            <Navigation className="w-3.5 h-3.5 mr-2 rotate-45 text-indigo-400" /> TODAY
          </button>
          
          <button onClick={addStep} className="flex items-center px-6 py-2 text-[10px] font-bold bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-all shadow-lg">
            <Plus className="w-4 h-4 mr-1" /> ADD PHASE
          </button>
        </div>
      </header>

      <div className="bg-white border-b border-gray-200 px-6 py-1.5 flex items-center justify-between z-20">
         <div className="flex items-center space-x-4">
           <div className="flex items-center space-x-2 text-[10px] font-bold text-gray-500">
             <Calendar className="w-3.5 h-3.5" />
             <span className="uppercase">Project Period:</span>
             <span className="text-indigo-600 font-mono">{formatProjectDate(rawTimelineStart)} - {formatProjectDate(rawTimelineEnd)}</span>
           </div>
           <div className={`flex items-center transition-opacity duration-300 ${isSyncing ? 'opacity-100' : 'opacity-40'}`}>
              <Database className="w-3 h-3 text-indigo-400 mr-1.5" />
              <span className="text-[8px] font-black uppercase tracking-tighter text-gray-400">LocalStorage Synced</span>
           </div>
         </div>
         <div className="flex items-center space-x-6">
           <button onClick={() => setShowTable(!showTable)} className="flex items-center text-[10px] font-bold text-indigo-600 hover:bg-indigo-50 px-3 py-1.5 rounded transition-all">
             <Maximize2 className="w-3.5 h-3.5 mr-2" />
             {showTable ? "HIDE TABLE" : "SHOW FULL CHART"}
           </button>
         </div>
      </div>

      <main className="flex flex-1 overflow-hidden relative">
        {showTable && (
          <>
            <div ref={tableContainerRef} onScroll={handleScroll} style={{ width: tableWidth }} className="flex-shrink-0 bg-white border-r border-gray-300 overflow-y-auto overflow-x-auto select-none scroll-smooth">
              <table className="min-w-full text-[11px] text-left border-collapse table-fixed">
                <thead className="sticky top-0 bg-[#34495e] text-white z-20 shadow-md">
                  <tr style={{ height: headerHeight }}>
                    <th className="w-8"></th>
                    <th className="w-12 px-1 text-center font-bold border-r border-white/10 uppercase">ID</th>
                    <th className="w-12 px-1 text-center font-bold border-r border-white/10">S ID</th>
                    <th className="w-16 px-1 text-center font-bold border-r border-white/10">T ID</th>
                    <th className="w-20 px-1 text-center font-bold border-r border-white/10 uppercase">Type</th>
                    <th className="w-64 px-3 text-left font-bold border-r border-white/10 uppercase">Description</th>
                    <th className="w-32 px-3 text-left font-bold border-r border-white/10 uppercase">Accountable</th>
                    <th className="w-10 px-1 text-center font-bold border-r border-white/10 uppercase">Clr</th>
                    <th className="w-16 px-1 text-center font-bold border-r border-white/10 uppercase">Days</th>
                    <th className="w-24 px-2 text-left font-bold border-r border-white/10 uppercase">Start</th>
                    <th className="w-24 px-2 text-left font-bold border-r border-white/10 uppercase">End</th>
                    <th className="w-20 px-1 text-center font-bold border-r border-white/10 uppercase">% PROGRESS</th>
                    <th className="w-12 px-1 text-center font-bold border-r border-white/10 uppercase">Mode</th>
                    <th className="w-20"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {items.map((item, idx) => (
                    <tr key={item.id} draggable onDragStart={() => onDragStart(idx)} onDragOver={(e) => e.preventDefault()} onDrop={() => onDrop(idx)} className={`group hover:bg-gray-50 transition-colors ${item.type === 'S' ? 'bg-gray-100/60 font-bold' : ''}`} style={{ height: rowHeight }}>
                      <td className="text-center cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500"><GripVertical className="w-3.5 h-3.5 mx-auto" /></td>
                      <td className="text-center text-gray-400 bg-gray-50/80 border-r">{idx + 1}</td>
                      <td className="text-center border-r"><input className="w-full text-center bg-transparent border-none p-0 focus:ring-1 focus:ring-indigo-300" value={item.sId} type="number" onChange={e => updateItem(item.id, { sId: parseInt(e.target.value) || 0 })} /></td>
                      <td className="text-center border-r"><input className="w-full text-center bg-transparent border-none p-0 focus:ring-1 focus:ring-indigo-300 disabled:opacity-0" value={item.type === 'S' ? '' : item.tId} disabled={item.type === 'S'} onChange={e => updateItem(item.id, { tId: e.target.value })} /></td>
                      <td className="text-center border-r px-1">
                         <select className={`w-full bg-transparent border-none p-0 text-[10px] font-bold focus:ring-0 cursor-pointer rounded ${item.type === 'S' ? 'text-indigo-600' : 'text-amber-600'}`} value={item.type} onChange={e => updateItem(item.id, { type: e.target.value as ItemType })}>
                           <option value="S">STEP</option><option value="T">TASK</option>
                         </select>
                      </td>
                      <td className="px-3 border-r truncate"><div className="flex items-center h-full">{item.type === 'T' && <div className="w-4 border-l border-gray-300 h-full mr-2" />}<input className="w-full bg-transparent border-none p-0 focus:ring-0 text-[11px]" value={item.description} onChange={e => updateItem(item.id, { description: e.target.value })} /></div></td>
                      <td className="px-3 border-r truncate"><div className="flex items-center h-full text-gray-600"><User className="w-3 h-3 mr-1.5 text-gray-400 shrink-0" /><input className="w-full bg-transparent border-none p-0 focus:ring-0 text-[10px]" placeholder="Person..." value={item.accountable} onChange={e => updateItem(item.id, { accountable: e.target.value })} /></div></td>
                      <td className="border-r px-2"><div className="w-full h-4 rounded-sm shadow-inner" style={{ backgroundColor: item.color, opacity: item.type === 'T' ? 0.8 : 1 }} /></td>
                      <td className="text-center border-r font-mono"><input disabled={item.type === 'S'} className={`w-full text-center bg-transparent border-none p-0 focus:ring-0 font-bold ${item.type === 'S' ? 'text-gray-400' : 'text-blue-600'}`} value={item.workDays} type="number" onChange={e => updateItem(item.id, { workDays: parseInt(e.target.value) || 1 })} /></td>
                      <td className="px-2 border-r font-mono whitespace-nowrap"><input type="date" disabled={item.type === 'S'} className="w-full bg-transparent border-none p-0 focus:ring-0 text-[10px]" value={item.start} onChange={e => updateItem(item.id, { start: e.target.value })} /></td>
                      <td className="px-2 border-r font-mono whitespace-nowrap"><input type="date" disabled={item.type === 'S'} className="w-full bg-transparent border-none p-0 focus:ring-0 text-[10px]" value={item.end} onChange={e => updateItem(item.id, { end: e.target.value })} /></td>
                      <td className="text-center border-r text-indigo-700 font-bold bg-indigo-50/20"><div className="flex items-center justify-center space-x-0.5"><input className="w-10 text-right bg-transparent border-none p-0 focus:ring-1 focus:ring-indigo-300 font-bold" value={item.progress} type="number" min="0" max="100" onChange={e => updateItem(item.id, { progress: parseInt(e.target.value) || 0 })} /><span className="text-[9px] text-indigo-400">%</span></div></td>
                      <td className="text-center border-r"><select className="bg-transparent border-none p-0 text-[10px] focus:ring-0 cursor-pointer uppercase font-bold" value={item.mode} onChange={e => updateItem(item.id, { mode: e.target.value as DependencyMode })}><option value="SS">SS</option><option value="FS">FS</option><option value="SF">SF</option><option value="FF">FF</option></select></td>
                      <td className="text-center flex items-center justify-center space-x-1 h-full px-1">
                        <button onClick={() => addItemAt(idx)} className="p-1 text-indigo-300 hover:text-indigo-600 opacity-0 group-hover:opacity-100 transition-all hover:bg-indigo-50 rounded" title="Add Task Below"><Plus className="w-3.5 h-3.5" /></button>
                        <button onClick={() => setItemToDelete(item)} className="p-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all hover:bg-red-50 rounded" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                      </td>
                    </tr>
                  ))}
                  <tr style={{ height: bottomButtonHeight }}>
                    <td colSpan={14} className="p-3 border-t border-gray-100 bg-gray-50/30">
                      <button onClick={addStep} className="text-[10px] font-bold text-indigo-600 hover:bg-indigo-100 px-4 py-2 rounded-lg transition-all flex items-center shadow-sm bg-white border border-indigo-100 uppercase tracking-widest">
                        <Plus className="w-3.5 h-3.5 mr-2" /> CREATE NEW PHASE
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div onMouseDown={startResizing} className={`w-1.5 flex-shrink-0 cursor-col-resize hover:bg-indigo-400 bg-gray-300 transition-colors flex items-center justify-center z-40 group ${isResizing ? 'bg-indigo-500 shadow-[0_0_10px_rgba(79,70,229,0.5)]' : ''}`}>
              <GripVertical className="w-4 h-4 text-gray-400 group-hover:text-white pointer-events-none" />
            </div>
          </>
        )}

        <div ref={ganttContainerRef} onScroll={handleScroll} className="flex-1 bg-white overflow-auto relative scroll-smooth">
          <div style={{ width: Math.max(0, daysCount * dayWidth), minHeight: '100%' }} className="relative bg-[#fafbfc]">
            <div className="sticky top-0 bg-[#34495e] z-30 shadow-md">
               <svg width={Math.max(0, daysCount * dayWidth)} height={headerHeight} className="block">
                  {/* Month headers */}
                  {visibleDates.map((date, i) => {
                    if (date.getDate() === 1 || i === 0) {
                      return (
                        <g key={`month-${i}`}>
                           <rect x={i * dayWidth} y={0} width={dayWidth * 30} height={26} fill="#2c3e50" />
                           <text x={i * dayWidth + 10} y={18} fill="white" className="text-[10px] font-bold uppercase tracking-widest">{format(date, 'MMMM yyyy')}</text>
                        </g>
                      );
                    }
                    return null;
                  })}
                  
                  {/* Week Numbers - Improved Styling */}
                  {visibleDates.map((date, i) => {
                    const isFirstDayOfWeek = date.getDay() === 1; 
                    if (isFirstDayOfWeek || i === 0) {
                      return (
                        <g key={`week-${i}`}>
                           <rect x={i * dayWidth} y={26} width={dayWidth * (hideWeekends ? 5 : 7)} height={20} fill="#1a2b3c" />
                           <text x={i * dayWidth + 10} y={40} fill="#818cf8" className="text-[9px] font-black uppercase tracking-tighter">
                             WEEK {getISOWeek(date)}
                           </text>
                        </g>
                      );
                    }
                    return null;
                  })}

                  {/* Day headers */}
                  {visibleDates.map((date, i) => {
                    const isWe = isWeekend(date);
                    const x = i * dayWidth;
                    return (
                      <g key={`header-${i}`}>
                        <rect x={x} y={46} width={dayWidth} height={28} fill={isWe ? "#243342" : "#2c3e50"} />
                        <line x1={x} y1={46} x2={x} y2={headerHeight} stroke="rgba(255,255,255,0.05)" />
                        <text x={x + dayWidth/2} y={64} textAnchor="middle" fill="white" className="text-[9px] opacity-80 uppercase">{format(date, 'EEEEE')}</text>
                        <text x={x + dayWidth/2} y={74} textAnchor="middle" fill="white" className="text-[10px] font-bold">{format(date, 'd')}</text>
                        <text x={x + dayWidth/2} y={94} textAnchor="middle" fill="#95a5a6" className="text-[8px]">{format(date, 'dd-MMM').toUpperCase()}</text>
                      </g>
                    );
                  })}
               </svg>
            </div>
            <div className="relative">
              {/* Ensure Gantt background height matches table exactly */}
              <svg className="absolute inset-0 pointer-events-none" width={Math.max(0, daysCount * dayWidth)} height={(items.length * rowHeight) + bottomButtonHeight}>
                 {items.map((item, i) => item.type === 'S' ? (<rect key={`bg-shade-${i}`} x={0} y={i * rowHeight} width={Math.max(0, daysCount * dayWidth)} height={rowHeight} fill="rgba(0,0,0,0.02)" />) : null)}
                 
                 {visibleDates.map((date, i) => {
                    if (isWeekend(date)) return <rect key={`we-${i}`} x={i * dayWidth} y={0} width={dayWidth} height={(items.length * rowHeight) + bottomButtonHeight} fill="rgba(0,0,0,0.03)" />;
                    return null;
                 })}
                 
                 {visibleDates.map((_, i) => (<line key={`grid-${i}`} x1={i * dayWidth} y1={0} x2={i * dayWidth} y2={(items.length * rowHeight) + bottomButtonHeight} stroke="#e5e7eb" strokeWidth="0.5" />))}
                 {Array.from({ length: items.length + 1 }).map((_, i) => (
                    <line key={`hgrid-${i}`} x1={0} y1={i * rowHeight} x2={Math.max(0, daysCount * dayWidth)} y2={i * rowHeight} stroke={items[i]?.type === 'S' ? "#94a3b8" : "#e5e7eb"} strokeWidth={items[i]?.type === 'S' ? "1.5" : "0.5"} />
                 ))}
                 {/* Bottom border line matching the button row */}
                 <line x1={0} y1={(items.length * rowHeight) + bottomButtonHeight} x2={Math.max(0, daysCount * dayWidth)} y2={(items.length * rowHeight) + bottomButtonHeight} stroke="#e5e7eb" strokeWidth="0.5" />
              </svg>

              {items.map((item, idx) => {
                const itemStart = startOfDay(parseISO(item.start));
                const itemEnd = startOfDay(parseISO(item.end));
                if (!isValid(itemStart) || !isValid(itemEnd)) return null;

                let firstVisibleIdx = visibleDates.findIndex(d => isSameDay(d, itemStart));
                if (firstVisibleIdx === -1) firstVisibleIdx = visibleDates.findIndex(d => d > itemStart);
                let lastVisibleIdx = visibleDates.findIndex(d => isSameDay(d, itemEnd));
                if (lastVisibleIdx === -1) {
                  const lastBefore = [...visibleDates].reverse().find(d => d < itemEnd);
                  if (lastBefore) lastVisibleIdx = visibleDates.findIndex(d => isSameDay(d, lastBefore));
                }

                if (firstVisibleIdx === -1 || lastVisibleIdx === -1 || firstVisibleIdx > lastVisibleIdx) return null;

                const x = firstVisibleIdx * dayWidth;
                const width = (lastVisibleIdx - firstVisibleIdx + 1) * dayWidth;
                const barHeight = rowHeight * 0.6;
                const barY = (rowHeight - barHeight) / 2;

                return (
                  <div key={item.id} style={{ height: rowHeight }} className="relative group">
                    <svg className="absolute inset-0 w-full h-full overflow-visible">
                      <g className="cursor-pointer">
                        {item.type === 'S' && <rect x={x} y={barY + 2} width={width} height={barHeight} fill="black" opacity="0.1" rx={3} />}
                        <rect x={x} y={barY} width={width} height={barHeight} rx={item.type === 'S' ? 4 : 2} fill={item.color} opacity={item.type === 'T' ? 0.8 : 1} className="transition-opacity hover:opacity-100" />
                        <rect x={x} y={barY + barHeight - 4} width={(width * item.progress) / 100} height={4} fill="rgba(255,255,255,0.5)" rx={1} />
                        <text x={width > 80 ? x + 8 : x + width + 8} y={barY + barHeight / 2 + 4} className={`text-[10px] font-bold pointer-events-none ${width > 80 ? 'fill-white' : 'fill-gray-600'}`}>
                          {item.description} {item.progress}% {item.accountable ? `• ${item.accountable}` : ''}
                        </text>
                      </g>
                    </svg>
                  </div>
                );
              })}
              
              {todayX !== -100 && (
                <svg className="absolute inset-0 pointer-events-none" width={Math.max(0, daysCount * dayWidth)} height={(items.length * rowHeight) + bottomButtonHeight}>
                  <line x1={todayX} y1={0} x2={todayX} y2={(items.length * rowHeight) + bottomButtonHeight} stroke="#e74c3c" strokeWidth="2" strokeDasharray="4 2" />
                  <rect x={todayX - 25} y={0} width={50} height={14} fill="#e74c3c" rx={2} />
                  <text x={todayX} y={10} textAnchor="middle" fill="white" className="text-[9px] font-bold uppercase">TODAY</text>
                </svg>
              )}
            </div>
          </div>
        </div>
      </main>

      <footer className="bg-[#1a2b3c] text-[#95a5a6] px-6 py-2 flex justify-between items-center text-[10px] font-medium border-t border-[#2c3e50] z-30">
        <div className="flex items-center space-x-6">
           <span className="flex items-center uppercase tracking-widest opacity-80"><Calendar className="w-3 h-3 mr-2 text-indigo-400"/> Project Period: {formatProjectDate(rawTimelineStart)} - {formatProjectDate(rawTimelineEnd)}</span>
           <span className="bg-[#2c3e50] px-2 py-0.5 rounded text-white font-bold uppercase tracking-tighter">{items.length} ACTIVE LINES</span>
           {hideWeekends && (
             <span className="text-amber-400 font-bold uppercase tracking-widest animate-pulse">Weekend View Hidden</span>
           )}
        </div>
        <div className="flex items-center space-x-4">
           <span className={`flex items-center uppercase tracking-widest text-[8px] transition-colors duration-500 ${isSyncing ? 'text-indigo-400' : 'text-gray-500'}`}>
              <Database className={`w-2.5 h-2.5 mr-1 ${isSyncing ? 'animate-bounce' : ''}`}/> {isSyncing ? 'Syncing to LocalStorage...' : 'Browser Persistence Active'}
           </span>
        </div>
      </footer>
    </div>
  );
}
