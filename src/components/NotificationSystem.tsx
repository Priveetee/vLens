// src/components/NotificationSystem.tsx
import React, { useState, useEffect } from 'react';
import './NotificationSystem.css';

interface NotificationProps {
  message: string;
  type?: 'success' | 'error' | 'info' | 'warning';
  duration?: number;
  onClose?: () => void;
}

export const Notification: React.FC<NotificationProps> = ({ 
  message, 
  type = 'info', 
  duration = 3000, 
  onClose 
}) => {
  const [visible, setVisible] = useState(true);
  
  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      if (onClose) {
        setTimeout(onClose, 300); 
      }
    }, duration);
    
    return () => clearTimeout(timer);
  }, [duration, onClose]);
  
  return (
    <div className={`notification ${type} ${visible ? 'visible' : 'hidden'}`}>
      <div className="notification-content">
        {message}
        <button className="notification-close" onClick={() => setVisible(false)}>×</button>
      </div>
    </div>
  );
};

// Manager component for handling multiple notifications
interface NotificationManagerProps {
  children: React.ReactNode;
}

interface NotificationData extends NotificationProps {
  id: number;
}

export const NotificationContext = React.createContext<{
  showNotification: (props: NotificationProps) => void;
}>({
  showNotification: () => {},
});

export const NotificationProvider: React.FC<NotificationManagerProps> = ({ children }) => {
  const [notifications, setNotifications] = useState<NotificationData[]>([]);
  let nextId = 0;
  
  const showNotification = (props: NotificationProps) => {
    const id = nextId++;
    setNotifications(prev => [...prev, { ...props, id }]);
  };
  
  const removeNotification = (id: number) => {
    setNotifications(prev => prev.filter(notification => notification.id !== id));
  };
  
  return (
    <NotificationContext.Provider value={{ showNotification }}>
      {children}
      <div className="notification-container">
        {notifications.map(notification => (
          <Notification
            key={notification.id}
            message={notification.message}
            type={notification.type}
            duration={notification.duration}
            onClose={() => removeNotification(notification.id)}
          />
        ))}
      </div>
    </NotificationContext.Provider>
  );
};

// Hook for using notifications in components
export const useNotification = () => {
  const context = React.useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within NotificationProvider');
  }
  return context;
};
