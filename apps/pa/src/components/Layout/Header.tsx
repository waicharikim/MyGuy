import React, { useState } from 'react';
import { Search, Bell, Moon, Sun, User, X } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { format } from 'date-fns';

const Header: React.FC = () => {
  const { state, dispatch } = useApp();
  const [showNotifications, setShowNotifications] = useState(false);

  const unreadNotifications = state.notifications.filter(n => !n.read);

  const markAsRead = (notificationId: string) => {
    dispatch({ type: 'MARK_NOTIFICATION_READ', payload: notificationId });
  };

  const markAllAsRead = () => {
    state.notifications.forEach(notification => {
      if (!notification.read) {
        dispatch({ type: 'MARK_NOTIFICATION_READ', payload: notification.id });
      }
    });
  };

  return (
    <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 px-4 py-3 md:px-6 fixed top-0 left-0 right-0 z-40">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">
            Personal Assistant
          </h1>
        </div>
        
        <div className="flex items-center space-x-3">
          <div className="relative hidden md:block">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search everything..."
              className="pl-10 pr-4 py-2 w-64 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            />
          </div>
          
          {/* Notifications */}
          <div className="relative">
            <button 
              onClick={() => setShowNotifications(!showNotifications)}
              className="p-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors relative"
            >
              <Bell className="w-5 h-5" />
              {unreadNotifications.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                  {unreadNotifications.length > 9 ? '9+' : unreadNotifications.length}
                </span>
              )}
            </button>

            {/* Notifications Dropdown */}
            {showNotifications && (
              <div className="absolute right-0 top-full mt-2 w-80 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg z-50">
                <div className="p-4 border-b border-slate-200 dark:border-slate-700">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-slate-900 dark:text-white">Notifications</h3>
                    <div className="flex items-center space-x-2">
                      {unreadNotifications.length > 0 && (
                        <button
                          onClick={markAllAsRead}
                          className="text-xs text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300"
                        >
                          Mark all read
                        </button>
                      )}
                      <button
                        onClick={() => setShowNotifications(false)}
                        className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="max-h-96 overflow-y-auto">
                  {state.notifications.length > 0 ? (
                    state.notifications
                      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                      .slice(0, 10)
                      .map(notification => (
                        <div
                          key={notification.id}
                          onClick={() => markAsRead(notification.id)}
                          className={`p-4 border-b border-slate-100 dark:border-slate-700 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors ${
                            !notification.read ? 'bg-emerald-50 dark:bg-emerald-900/20' : ''
                          }`}
                        >
                          <div className="flex items-start space-x-3">
                            <div className={`w-2 h-2 rounded-full mt-2 ${
                              notification.type === 'error' ? 'bg-red-500' :
                              notification.type === 'warning' ? 'bg-yellow-500' :
                              notification.type === 'success' ? 'bg-green-500' : 'bg-blue-500'
                            }`} />
                            <div className="flex-1">
                              <h4 className="font-medium text-slate-900 dark:text-white text-sm">
                                {notification.title}
                              </h4>
                              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                                {notification.message}
                              </p>
                              <p className="text-xs text-slate-500 mt-2">
                                {format(new Date(notification.createdAt), 'MMM d, h:mm a')}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))
                  ) : (
                    <div className="p-8 text-center">
                      <Bell className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                      <p className="text-slate-500 dark:text-slate-400">No notifications yet</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          
          <button
            onClick={() => dispatch({ type: 'TOGGLE_DARK_MODE' })}
            className="p-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
          >
            {state.darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
          
          <button className="p-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">
            <User className="w-5 h-5" />
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;