import React, { useState } from 'react';
import { Plus, Search, Tag, FileText } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { Note } from '../../types';

const NotesView: React.FC = () => {
  const { state, dispatch } = useApp();
  const [showAddNote, setShowAddNote] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTag, setSelectedTag] = useState<string>('all');

  const allTags = Array.from(new Set(state.notes.flatMap(note => note.tags)));
  
  const filteredNotes = state.notes.filter(note => {
    const matchesSearch = note.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         note.content.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesTag = selectedTag === 'all' || note.tags.includes(selectedTag);
    return matchesSearch && matchesTag;
  });

  const handleAddNote = (noteData: Omit<Note, 'id' | 'createdAt' | 'updatedAt'>) => {
    const newNote: Note = {
      ...noteData,
      id: Date.now().toString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    dispatch({ type: 'ADD_NOTE', payload: newNote });
    setShowAddNote(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Notes</h2>
        <button
          onClick={() => setShowAddNote(true)}
          className="flex items-center space-x-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>Add Note</span>
        </button>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search notes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        
        <select
          value={selectedTag}
          onChange={(e) => setSelectedTag(e.target.value)}
          className="px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
        >
          <option value="all">All Tags</option>
          {allTags.map(tag => (
            <option key={tag} value={tag}>{tag}</option>
          ))}
        </select>
      </div>

      {/* Notes Grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredNotes.map(note => (
          <div
            key={note.id}
            className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4 hover:shadow-md transition-all duration-200 cursor-pointer group"
          >
            <div className="flex items-start justify-between mb-3">
              <h3 className="font-semibold text-slate-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                {note.title}
              </h3>
              <FileText className="w-4 h-4 text-slate-400" />
            </div>
            
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-3 line-clamp-3">
              {note.content}
            </p>
            
            <div className="flex flex-wrap gap-1 mb-3">
              {note.tags.map(tag => (
                <span
                  key={tag}
                  className="px-2 py-1 text-xs bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded"
                >
                  {tag}
                </span>
              ))}
            </div>
            
            <div className="text-xs text-slate-500">
              {new Date(note.updatedAt).toLocaleDateString()}
            </div>
          </div>
        ))}
      </div>

      {filteredNotes.length === 0 && (
        <div className="text-center py-12">
          <FileText className="w-12 h-12 text-slate-400 mx-auto mb-4" />
          <p className="text-slate-500 dark:text-slate-400">
            {searchTerm || selectedTag !== 'all' ? 'No notes found matching your criteria' : 'No notes yet. Create your first note!'}
          </p>
        </div>
      )}

      {showAddNote && (
        <AddNoteModal onAdd={handleAddNote} onClose={() => setShowAddNote(false)} />
      )}
    </div>
  );
};

const AddNoteModal: React.FC<{
  onAdd: (note: Omit<Note, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onClose: () => void;
}> = ({ onAdd, onClose }) => {
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    tags: [] as string[]
  });
  const [tagInput, setTagInput] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.title.trim()) {
      onAdd(formData);
    }
  };

  const addTag = () => {
    if (tagInput.trim() && !formData.tags.includes(tagInput.trim())) {
      setFormData({
        ...formData,
        tags: [...formData.tags, tagInput.trim()]
      });
      setTagInput('');
    }
  };

  const removeTag = (tag: string) => {
    setFormData({
      ...formData,
      tags: formData.tags.filter(t => t !== tag)
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-slate-800 rounded-lg max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Add New Note</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Title *
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-slate-700"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Content
            </label>
            <textarea
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-slate-700"
              rows={6}
              placeholder="Write your note here..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Tags
            </label>
            <div className="flex space-x-2 mb-2">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                className="flex-1 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-slate-700"
                placeholder="Add a tag"
              />
              <button
                type="button"
                onClick={addTag}
                className="px-3 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
              >
                <Tag className="w-4 h-4" />
              </button>
            </div>
            
            <div className="flex flex-wrap gap-1">
              {formData.tags.map(tag => (
                <span
                  key={tag}
                  className="px-2 py-1 text-xs bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded cursor-pointer hover:bg-emerald-200 dark:hover:bg-emerald-900/50"
                  onClick={() => removeTag(tag)}
                >
                  {tag} ×
                </span>
              ))}
            </div>
          </div>

          <div className="flex space-x-3 pt-4">
            <button
              type="submit"
              className="flex-1 bg-emerald-600 text-white py-2 px-4 rounded-lg hover:bg-emerald-700 transition-colors"
            >
              Add Note
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-slate-300 dark:bg-slate-600 text-slate-700 dark:text-slate-300 py-2 px-4 rounded-lg hover:bg-slate-400 dark:hover:bg-slate-500 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default NotesView;