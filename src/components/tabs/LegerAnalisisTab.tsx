import React, { useEffect, useState } from 'react';
import { BarChart3, Table } from 'lucide-react';
import { ActiveUser, SchoolProfile, Student, Subject, Teacher } from '../../types';
import { LegerTab } from './LegerTab';
import { AnalisisSoalTab } from './AnalisisSoalTab';

interface Props {
  activeUser?: ActiveUser;
  profile: SchoolProfile;
  subjects: Subject[];
  students: Student[];
  teachers: Teacher[];
  activeClass: string;
  activeYear: string;
  activeSemester: string;
  showToast: (msg: string, type?: 'success' | 'error') => void;
  onOpenZoom: (url: string, title: string) => void;
  initialSubTab?: 'leger' | 'analisis';
}

export const LegerAnalisisTab: React.FC<Props> = ({
  activeUser,
  profile,
  subjects,
  students,
  teachers,
  activeClass,
  activeYear,
  activeSemester,
  showToast,
  onOpenZoom,
  initialSubTab = 'leger',
}) => {
  const [subTab, setSubTab] = useState<'leger' | 'analisis'>(initialSubTab);

  useEffect(() => {
    setSubTab(initialSubTab);
  }, [initialSubTab]);

  return (
    <div className="space-y-5">
      {/* Tab Switcher Leger Nilai & Analisis Soal */}
      <div className="bg-white p-2 rounded-2xl border border-slate-200 shadow-2xs inline-flex flex-wrap gap-1.5 no-print">
        <button
          type="button"
          onClick={() => setSubTab('leger')}
          className={`px-4 py-2.5 rounded-xl font-display font-extrabold text-xs flex items-center gap-2 transition cursor-pointer ${
            subTab === 'leger'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Table className="w-4 h-4" />
          <span>Leger / Rekap Nilai</span>
        </button>
        <button
          type="button"
          onClick={() => setSubTab('analisis')}
          className={`px-4 py-2.5 rounded-xl font-display font-extrabold text-xs flex items-center gap-2 transition cursor-pointer ${
            subTab === 'analisis'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          <span>Analisis Soal &amp; Grafik</span>
        </button>
      </div>

      {subTab === 'leger' ? (
        <LegerTab
          profile={profile}
          subjects={subjects}
          students={students}
          activeClass={activeClass}
          activeYear={activeYear}
          activeSemester={activeSemester}
          showToast={showToast}
          onOpenZoom={onOpenZoom}
        />
      ) : (
        <AnalisisSoalTab
          activeUser={activeUser}
          students={students}
          teachers={teachers}
          profile={profile}
          activeClass={activeClass}
          activeYear={activeYear}
          activeSemester={activeSemester}
          showToast={showToast}
        />
      )}
    </div>
  );
};
