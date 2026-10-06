import React, { useState } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths } from 'date-fns';
import { Plus, ChevronLeft, ChevronRight, Clock, MapPin } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { CalendarEvent } from '../../types';

const CalendarView: React.FC = () => {
  const { state, dispatch } = useApp();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [showAddEvent, setShowAddEvent] = useState(false);

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const getEventsForDate = (date: Date) => {
    return state.events.filter(event => 
      isSameDay(new Date(event.startTime), date)
    );
  };

  const handleAddEvent = (eventData: Omit<CalendarEvent, 'id' | 'createdAt'>) => {
    const newEvent: CalendarEvent = {
      ...eventData,
      id: Date.now().toString(),
      createdAt: new Date().toISOString(),
    };
    dispatch({ type: 'ADD_EVENT', payload: newEvent });
    setShowAddEvent(false);
  };

  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Calendar</h2>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setCurrentDate(subMonths(currentDate, 1))}
              className="p-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white min-w-[200px] text-center">
              {format(currentDate, 'MMMM yyyy')}
            </h3>
            <button
              onClick={() => setCurrentDate(addMonths(currentDate, 1))}
              className="p-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
        <button
          onClick={() => setShowAddEvent(true)}
          className="flex items-center space-x-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>Add Event</span>
        </button>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Calendar Grid */}
        <div className="lg:col-span-2">
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
            {/* Week Days Header */}
            <div className="grid grid-cols-7 gap-1 mb-2">
              {weekDays.map(day => (
                <div key={day} className="p-2 text-center text-sm font-medium text-slate-600 dark:text-slate-400">
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar Days */}
            <div className="grid grid-cols-7 gap-1">
              {days.map(day => {
                const events = getEventsForDate(day);
                const isToday = isSameDay(day, new Date());
                const isSelected = selectedDate && isSameDay(day, selectedDate);

                return (
                  <div
                    key={day.toISOString()}
                    onClick={() => setSelectedDate(day)}
                    className={`min-h-[80px] p-2 border border-slate-100 dark:border-slate-700 cursor-pointer transition-all hover:bg-slate-50 dark:hover:bg-slate-700 ${
                      isToday ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800' : ''
                    } ${
                      isSelected ? 'ring-2 ring-emerald-500' : ''
                    }`}
                  >
                    <div className={`text-sm font-medium mb-1 ${
                      isToday ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-900 dark:text-white'
                    }`}>
                      {format(day, 'd')}
                    </div>
                    <div className="space-y-1">
                      {events.slice(0, 2).map(event => (
                        <div
                          key={event.id}
                          className="text-xs bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-1 py-0.5 rounded truncate"
                        >
                          {event.title}
                        </div>
                      ))}
                      {events.length > 2 && (
                        <div className="text-xs text-slate-500">
                          +{events.length - 2} more
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Selected Date Events */}
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700">
              <h3 className="font-semibold text-slate-900 dark:text-white">
                {selectedDate ? format(selectedDate, 'EEEE, MMMM do') : 'Select a date'}
              </h3>
            </div>
            <div className="p-4">
              {selectedDate ? (
                <div className="space-y-3">
                  {getEventsForDate(selectedDate).map(event => (
                    <div
                      key={event.id}
                      className="p-3 bg-slate-50 dark:bg-slate-700 rounded-lg"
                    >
                      <h4 className="font-medium text-slate-900 dark:text-white mb-1">
                        {event.title}
                      </h4>
                      <div className="flex items-center space-x-2 text-sm text-slate-600 dark:text-slate-400 mb-1">
                        <Clock className="w-4 h-4" />
                        <span>
                          {format(new Date(event.startTime), 'h:mm a')} - {format(new Date(event.endTime), 'h:mm a')}
                        </span>
                      </div>
                      {event.location && (
                        <div className="flex items-center space-x-2 text-sm text-slate-600 dark:text-slate-400 mb-1">
                          <MapPin className="w-4 h-4" />
                          <span>{event.location}</span>
                        </div>
                      )}
                      {event.description && (
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                          {event.description}
                        </p>
                      )}
                    </div>
                  ))}
                  {getEventsForDate(selectedDate).length === 0 && (
                    <p className="text-slate-500 dark:text-slate-400 text-center py-4">
                      No events for this date
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-slate-500 dark:text-slate-400 text-center py-4">
                  Click on a date to view events
                </p>
              )}
            </div>
          </div>

          {/* Upcoming Events */}
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700">
              <h3 className="font-semibold text-slate-900 dark:text-white">Upcoming Events</h3>
            </div>
            <div className="p-4">
              <div className="space-y-3">
                {state.events
                  .filter(event => new Date(event.startTime) >= new Date())
                  .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
                  .slice(0, 3)
                  .map(event => (
                    <div key={event.id} className="p-3 bg-slate-50 dark:bg-slate-700 rounded-lg">
                      <h4 className="font-medium text-slate-900 dark:text-white mb-1">
                        {event.title}
                      </h4>
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        {format(new Date(event.startTime), 'MMM d, h:mm a')}
                      </p>
                    </div>
                  ))}
                {state.events.filter(event => new Date(event.startTime) >= new Date()).length === 0 && (
                  <p className="text-slate-500 dark:text-slate-400 text-center py-4">
                    No upcoming events
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {showAddEvent && (
        <AddEventModal 
          onAdd={handleAddEvent} 
          onClose={() => setShowAddEvent(false)}
          selectedDate={selectedDate}
        />
      )}
    </div>
  );
};

const AddEventModal: React.FC<{
  onAdd: (event: Omit<CalendarEvent, 'id' | 'createdAt'>) => void;
  onClose: () => void;
  selectedDate: Date | null;
}> = ({ onAdd, onClose, selectedDate }) => {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    startTime: selectedDate ? format(selectedDate, 'yyyy-MM-dd\'T\'HH:mm') : '',
    endTime: selectedDate ? format(selectedDate, 'yyyy-MM-dd\'T\'HH:mm') : '',
    location: ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.title.trim() && formData.startTime && formData.endTime) {
      onAdd(formData);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-slate-800 rounded-lg max-w-md w-full p-6">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Add New Event</h3>
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
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-slate-700"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Start Time *
              </label>
              <input
                type="datetime-local"
                value={formData.startTime}
                onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-slate-700"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                End Time *
              </label>
              <input
                type="datetime-local"
                value={formData.endTime}
                onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-slate-700"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Location
            </label>
            <input
              type="text"
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-slate-700"
              placeholder="Optional location"
            />
          </div>

          <div className="flex space-x-3 pt-4">
            <button
              type="submit"
              className="flex-1 bg-emerald-600 text-white py-2 px-4 rounded-lg hover:bg-emerald-700 transition-colors"
            >
              Add Event
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

export default CalendarView;